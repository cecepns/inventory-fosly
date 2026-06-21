import { useState, useEffect, useCallback, useRef } from 'react'
import { FiPlus, FiAlertTriangle, FiSearch, FiEdit2, FiTrash2 } from 'react-icons/fi'
import api from '../utils/api'
import { useNotification } from '../contexts/NotificationContext'
import { useAuth } from '../contexts/AuthContext'
import { usePagination } from '../hooks/usePagination'
import Pagination from '../components/Pagination'

export default function DamagedGoods() {
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [barcodeError, setBarcodeError] = useState('')
  const [formData, setFormData] = useState({
    barcode_id: '',
    code: '',
    name: '',
    stock: '',
    category: '',
    brand: '',
    damage_reason: '',
    date: new Date().toISOString().split('T')[0]
  })
  const { showSuccess, showError } = useNotification()
  const { hasRole } = useAuth()

  // Add ref for debouncing
  const barcodeCheckTimeoutRef = useRef(null)

  // Fetch function for pagination
  const fetchDamagedGoods = useCallback(async (params) => {
    const response = await api.get('/api/damaged-goods', { params })
    return response
  }, [])

  // Use pagination hook
  const {
    data: damagedGoods,
    loading: dataLoading,
    pagination,
    goToPage,
    updateParams,
    refresh
  } = usePagination(fetchDamagedGoods)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (barcodeCheckTimeoutRef.current) {
        clearTimeout(barcodeCheckTimeoutRef.current)
      }
    }
  }, [])

  // Update search params
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateParams({ search: searchTerm })
    }, 500) // Debounce search

    return () => clearTimeout(timeoutId)
  }, [searchTerm])

  const handleProductChange = useCallback((product) => {
    setSelectedProduct(product)
    if (product) {
      setFormData(prev => ({
        ...prev,
        code: product.code,
        name: product.name,
        category: product.category,
        brand: product.brand
      }))
    }
    // Don't clear form when product is null - let user keep their input
  }, [])

  const handleBarcodeChange = useCallback(async (barcode) => {
    setBarcodeError('') // Clear previous error
    
    // Look up product by barcode
    if (barcode && barcode.trim()) {
      try {
        const response = await api.get(`/api/products/barcode/${barcode}`)
        const product = response.data.data
        
        // Auto-select the product
        handleProductChange(product)
      } catch {
        // Barcode not found, show error but don't clear form
        setSelectedProduct(null)
        setBarcodeError('Barcode tidak ditemukan dalam database')
      }
    } else {
      // Clear product selection only when barcode is empty
      setSelectedProduct(null)
    }
  }, [handleProductChange])

  // Debounced barcode check function
  const debouncedCheckBarcode = useCallback((barcode) => {
    // Clear existing timeout
    if (barcodeCheckTimeoutRef.current) {
      clearTimeout(barcodeCheckTimeoutRef.current)
    }
    
    // Set new timeout
    barcodeCheckTimeoutRef.current = setTimeout(() => {
      handleBarcodeChange(barcode)
    }, 500)
  }, [handleBarcodeChange])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Validate barcode exists and product is found, but allow manual entry
      if (formData.barcode_id && !selectedProduct && barcodeError) {
        showError('Barcode tidak ditemukan dalam database! Silakan isi data secara manual atau perbaiki barcode.')
        return
      }

      if (editingItem) {
        await api.put(`/api/damaged-goods/${editingItem.id}`, formData)
        showSuccess('Barang rusak berhasil diperbarui')
      } else {
        await api.post('/api/damaged-goods', formData)
        showSuccess('Barang rusak berhasil ditambahkan')
      }
      
      resetForm()
      refresh()
    } catch (error) {
      showError(error.response?.data?.message || 'Gagal menyimpan barang rusak')
    } finally {
      setLoading(false)
    }
  }

  // Function to check if item can be edited (only managers)
  const canEditItem = () => {
    return hasRole('manager')
  }

  const getEditTooltip = () => {
    const isManager = hasRole('manager')
    
    if (!isManager) {
      return 'Hanya manager yang dapat mengedit data'
    }
    return 'Edit'
  }

  const getDeleteTooltip = () => {
    const isManager = hasRole('manager')
    
    if (!isManager) {
      return 'Hanya manager yang dapat menghapus data'
    }
    return 'Hapus'
  }

  // Helper function to format date for HTML date input
  const formatDateForInput = (dateString) => {
    if (!dateString) return ''
    
    // If it's already in YYYY-MM-DD format, return as is
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString
    }
    
    // Create date object and format to YYYY-MM-DD
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    return `${year}-${month}-${day}`
  }

  const handleEdit = (item) => {
    if (!canEditItem()) {
      showError('Hanya manager yang dapat mengedit data')
      return
    }
    
    setEditingItem(item)
    setFormData({
      barcode_id: item.barcode_id,
      code: item.code,
      name: item.name,
      stock: item.stock,
      category: item.category,
      brand: item.brand,
      damage_reason: item.damage_reason,
      date: formatDateForInput(item.date)
    })
    setSelectedProduct(null) // Reset selected product for editing
    setShowForm(true)
    setBarcodeError('')
  }

  const handleDelete = async (id) => {
    if (!canEditItem()) {
      showError('Hanya manager yang dapat menghapus data')
      return
    }
    
    if (window.confirm('Apakah Anda yakin ingin menghapus data ini?')) {
      try {
        await api.delete(`/api/damaged-goods/${id}`)
        showSuccess('Barang rusak berhasil dihapus')
        refresh()
      } catch (error) {
        showError(error.response?.data?.message || 'Gagal menghapus barang rusak')
      }
    }
  }

  const resetForm = () => {
    setFormData({
      barcode_id: '',
      code: '',
      name: '',
      stock: '',
      category: '',
      brand: '',
      damage_reason: '',
      date: new Date().toISOString().split('T')[0]
    })
    setSelectedProduct(null)
    setEditingItem(null)
    setShowForm(false)
    setBarcodeError('')
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Barang Rusak</h1>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-danger flex items-center"
        >
          <FiPlus className="mr-2" />
          Tambah Barang Rusak
        </button>
      </div>

      {/* Search */}
      <div className="card">
        <div className="relative">
          <FiSearch className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Cari barang rusak..."
            className="form-input pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem ? 'Edit Barang Rusak' : 'Tambah Barang Rusak'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Tanggal</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  required
                />
              </div>
              
              <div>
                <label className="form-label">Barcode (Scan Required)</label>
                <input
                  type="text"
                  className={`form-input ${barcodeError ? 'border-red-500 bg-red-50' : ''}`}
                  value={formData.barcode_id}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormData({...formData, barcode_id: value})
                    debouncedCheckBarcode(value)
                  }}
                  placeholder="Masukan barcode"
                  required
                />
                {barcodeError && (
                  <p className="text-sm text-red-600 mt-1 flex items-center">
                    <FiAlertTriangle className="mr-1" size={14} />
                    {barcodeError}
                  </p>
                )}
                {formData.barcode_id && !barcodeError && selectedProduct && (
                  <p className="text-sm text-green-600 mt-1">
                    Produk ditemukan: {selectedProduct.name}
                  </p>
                )}
              </div>
              
              <div>
                <label className="form-label">Kode Barang</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value})}
                  required
                  readOnly={selectedProduct !== null && !barcodeError}
                />
              </div>
              
              <div>
                <label className="form-label">Nama Barang</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                  readOnly={selectedProduct !== null && !barcodeError}
                />
              </div>
              
              <div>
                <label className="form-label">Jumlah Rusak</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.stock}
                  onChange={(e) => {
                    const value = e.target.value
                    // Prevent 0 and negative values
                    if (value === '' || (parseInt(value) > 0)) {
                      setFormData({...formData, stock: value})
                    }
                  }}
                  required
                  min="1"
                />
              </div>
              
              <div>
                <label className="form-label">Kategori</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  required
                  readOnly={selectedProduct !== null && !barcodeError}
                />
              </div>
              
              <div>
                <label className="form-label">Merk</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.brand}
                  onChange={(e) => setFormData({...formData, brand: e.target.value})}
                  required
                  readOnly={selectedProduct !== null && !barcodeError}
                />
              </div>
              
              <div>
                <label className="form-label">Alasan Kerusakan</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={formData.damage_reason}
                  onChange={(e) => setFormData({...formData, damage_reason: e.target.value})}
                  placeholder="Deskripsikan alasan kerusakan..."
                  required
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn btn-secondary"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-danger"
                >
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Damaged Goods Table */}
      <div className="card">
        {dataLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Barcode ID</th>
                    <th>Kode</th>
                    <th>Nama Barang</th>
                    <th>Jumlah</th>
                    <th>Kategori</th>
                    <th>Merk</th>
                    <th>Alasan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {damagedGoods.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.date).toLocaleDateString('id-ID')}</td>
                      <td>{item.barcode_id}</td>
                      <td>{item.code}</td>
                      <td>{item.name}</td>
                      <td>
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                          {item.stock}
                        </span>
                      </td>
                      <td>{item.category}</td>
                      <td>{item.brand}</td>
                      <td>
                        <span className="text-sm text-gray-600" title={item.damage_reason}>
                          {item.damage_reason.length > 30 
                            ? `${item.damage_reason.substring(0, 30)}...` 
                            : item.damage_reason}
                        </span>
                      </td>
                      <td>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className={`${hasRole('manager') 
                              ? 'text-blue-600 hover:text-blue-900' 
                              : 'text-gray-400 cursor-not-allowed'}`}
                            disabled={!hasRole('manager')}
                            title={getEditTooltip()}
                          >
                            <FiEdit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className={`${hasRole('manager') 
                              ? 'text-red-600 hover:text-red-900' 
                              : 'text-gray-400 cursor-not-allowed'}`}
                            disabled={!hasRole('manager')}
                            title={getDeleteTooltip()}
                          >
                            <FiTrash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {damagedGoods.length === 0 && (
                <div className="text-center py-8">
                  <FiAlertTriangle className="mx-auto text-gray-400 mb-4" size={48} />
                  <p className="text-gray-500">Tidak ada data barang rusak</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
              {/* Items per page selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Tampilkan:</label>
                <select
                  className="form-select text-sm"
                  value={pagination.limit}
                  onChange={(e) => {
                    updateParams({
                      limit: parseInt(e.target.value),
                      page: 1,
                    });
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-sm text-gray-600">
                  dari {pagination.total} item
                </span>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  totalItems={pagination.total}
                  itemsPerPage={pagination.limit}
                  onPageChange={goToPage}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}