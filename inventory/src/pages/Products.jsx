import { useState, useEffect } from 'react'
import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiPackage } from 'react-icons/fi'
import api from '../utils/api'
import { useNotification } from '../contexts/NotificationContext'
import { usePagination } from '../hooks/usePagination'
import Pagination from '../components/Pagination'

export default function Products() {
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('brand')
  const [formData, setFormData] = useState({
    barcode_id: '',
    code: '',
    name: '',
    initial_stock: '',
    category: '',
    brand: ''
  })
  
  const { showSuccess, showError } = useNotification()

  // Fetch function for pagination
  const fetchProducts = async (params) => {
    const response = await api.get('/api/products', { 
      params: {
        ...params,
        sort: sortBy
      }
    })
    return response
  }

  // Use pagination hook
  const {
    data: products,
    loading: dataLoading,
    pagination,
    goToPage,
    updateParams,
    refresh
  } = usePagination(fetchProducts)

  // Update search params
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateParams({ search: searchTerm })
    }, 500) // Debounce search

    return () => clearTimeout(timeoutId)
  }, [searchTerm])

  // Update sort params
  useEffect(() => {
    refresh()
  }, [sortBy])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (editingProduct) {
        await api.put(`/api/products/${editingProduct.id}`, formData)
        showSuccess('Produk berhasil diperbarui')
      } else {
        await api.post('/api/products', formData)
        showSuccess('Produk berhasil ditambahkan')
      }
      
      resetForm()
      refresh()
    } catch (error) {
      showError(error.response?.data?.message || 'Gagal menyimpan produk')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (product) => {
    setEditingProduct(product)
    setFormData({
      barcode_id: product.barcode_id,
      code: product.code,
      name: product.name,
      initial_stock: product.initial_stock,
      category: product.category,
      brand: product.brand
    })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus produk ini?')) {
      try {
        await api.delete(`/api/products/${id}`)
        showSuccess('Produk berhasil dihapus')
        refresh()
      } catch (error) {
        showError(error.response?.data?.message || 'Gagal menghapus produk')
      }
    }
  }

  const resetForm = () => {
    setFormData({
      barcode_id: '',
      code: '',
      name: '',
      initial_stock: '',
      category: '',
      brand: ''
    })
    setEditingProduct(null)
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Data Produk</h1>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary flex items-center"
        >
          <FiPlus className="mr-2" />
          Tambah Produk
        </button>
      </div>

      {/* Search and Sort */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-3 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Cari produk..."
              className="form-input pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div>
            <label className="form-label">Urutkan berdasarkan</label>
            <select
              className="form-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {/* <option value="name">Nama A-Z</option> */}
              {/* <option value="name_desc">Nama Z-A</option> */}
              <option value="brand">Merk A-Z</option>
              <option value="brand_desc">Merk Z-A</option>
              {/* <option value="date">Tanggal Terlama</option> */}
              <option value="date_desc">Tanggal Terbaru</option>
            </select>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingProduct ? 'Edit Produk' : 'Tambah Produk'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Barcode ID</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.barcode_id}
                  onChange={(e) => setFormData({...formData, barcode_id: e.target.value})}
                  required
                />
              </div>
              
              <div>
                <label className="form-label">Kode Barang</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value})}
                  required
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
                />
              </div>
              
              <div>
                <label className="form-label">Stok Awal</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.initial_stock}
                  onChange={(e) => {
                    const value = e.target.value
                    // Prevent negative values (allow 0 for initial stock)
                    if (value === '' || (parseInt(value) >= 0)) {
                      setFormData({...formData, initial_stock: value})
                    }
                  }}
                  required
                  min="0"
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
                  className="btn btn-primary"
                >
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Products Table */}
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
                    <th>Barcode ID</th>
                    <th>Kode</th>
                    <th>Nama Barang</th>
                    <th>Stok</th>
                    <th>Kategori</th>
                    <th>Merk</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.barcode_id}</td>
                      <td>{product.code}</td>
                      <td>{product.name}</td>
                      <td>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          product.current_stock <= 0 
                            ? 'bg-red-100 text-red-800'
                            : product.current_stock <= 10
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {product.current_stock}
                        </span>
                      </td>
                      <td>{product.category}</td>
                      <td>{product.brand}</td>
                      <td>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEdit(product)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <FiEdit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(product.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <FiTrash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {products.length === 0 && (
                <div className="text-center py-8">
                  <FiPackage className="mx-auto text-gray-400 mb-4" size={48} />
                  <p className="text-gray-500">Tidak ada produk ditemukan</p>
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