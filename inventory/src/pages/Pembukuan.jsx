import { useState, useEffect } from "react";
import {
  FiDollarSign,
  FiSearch,
  FiEdit2,
  FiTrendingUp,
  FiDownload,
} from "react-icons/fi";
import api from "../utils/api";
import { useNotification } from "../contexts/NotificationContext";
import { usePagination } from "../hooks/usePagination";
import Pagination from "../components/Pagination";
import * as XLSX from "xlsx";

export default function Pembukuan() {
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState({
    startDate: (() => {
      const now = new Date()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return sevenDaysAgo.toISOString().split("T")[0]
    })(),
    endDate: (() => {
      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      return sevenDaysFromNow.toISOString().split("T")[0]
    })(),
  });
  const [formData, setFormData] = useState({
    outgoing_goods_id: "",
    purchase_price: "",
    selling_price: "",
    discount: "",
  });
  const [stats, setStats] = useState({
    totalTransactions: 0,
    profitableTransactions: 0,
    totalProfit: 0,
    averageProfit: 0,
    totalQuantity: 0,
    totalPurchaseValue: 0,
    totalSellingValue: 0,
    totalDiscountValue: 0,
    productProfits: []
  });
  const { showSuccess, showError } = useNotification();

  // Fetch function for pagination
  const fetchPembukuan = async (params) => {
    const response = await api.get("/api/pembukuan", {
      params: {
        ...params,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },
    });
    return response;
  };

  // Use pagination hook
  const {
    data: pembukuan,
    loading: dataLoading,
    pagination,
    goToPage,
    updateParams,
    refresh,
  } = usePagination(fetchPembukuan);

  // Update search params
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateParams({ search: searchTerm });
    }, 500); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Fetch statistics
  const fetchStats = async () => {
    try {
      const response = await api.get('/api/pembukuan/stats', {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Update date range
  useEffect(() => {
    refresh();
    fetchStats();
  }, [dateRange]);

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      outgoing_goods_id: product.id,
      purchase_price: product.purchase_price || "",
      selling_price: product.selling_price || "",
      discount: product.discount || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post("/api/pembukuan", formData);
      showSuccess("Data pembukuan berhasil diperbarui");
      resetForm();
      refresh();
    } catch (error) {
      showError(error.response?.data?.message || "Gagal memperbarui pembukuan");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      outgoing_goods_id: "",
      purchase_price: "",
      selling_price: "",
      discount: "",
    });
    setEditingProduct(null);
    setShowForm(false);
  };

  // Helper function to safely format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return "0";
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return "0";
    return numValue.toLocaleString("id-ID");
  };

  // Use stats from API instead of local calculation
  const profitSummary = {
    totalProfit: stats.totalProfit,
    profitableProducts: stats.profitableTransactions,
    totalProducts: stats.totalTransactions
  };

  // Use product profits from API
  const productProfits = stats.productProfits.map(item => ({
    name: item.name,
    code: item.code,
    profit: parseFloat(item.total_profit) || 0
  }));

  const exportToExcel = () => {
    const exportData = pembukuan.map((item) => ({
      Tanggal: item.date,
      Kode: item.code,
      "Nama Produk": item.name,
      Kategori: item.category,
      Merk: item.brand,
      "Jumlah Keluar": item.quantity || 0,
      "No. Resi": item.resi_number || "",
      "Harga Beli": parseFloat(item.purchase_price) || 0,
      "Harga Jual": parseFloat(item.selling_price) || 0,
      Potongan: parseFloat(item.discount) || 0,
      Margin: parseFloat(item.margin) || 0,
    }));

    // Add summary data
    exportData.push({});
    exportData.push({
      Kode: "SUMMARY",
      "Nama Produk": "Total Keuntungan",
      Margin: profitSummary.totalProfit,
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pembukuan");
    XLSX.writeFile(
      wb,
      `pembukuan-${dateRange.startDate}-${dateRange.endDate}.xlsx`
    );

    showSuccess("Data pembukuan berhasil diexport ke Excel");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pembukuan</h1>

        </div>
        <div className="flex md:space-x-2 justify-end gap-2 flex-col md:flex-row items-center w-full md:w-auto">
          <button
            onClick={exportToExcel}
            className="btn btn-success flex items-center w-full md:w-auto"
          >
            <FiDownload className="mr-2" />
            Export Excel
          </button>
          <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-semibold">
            Total Keuntungan: Rp {formatCurrency(profitSummary.totalProfit)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div>
            <label className="form-label">Search</label>
            <div className="relative">
              <FiSearch
                className="absolute left-3 top-3 text-gray-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Cari produk..."
                className="form-input pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="form-label">Tanggal Mulai</label>
            <input
              type="date"
              className="form-input"
              value={dateRange.startDate}
              onChange={(e) =>
                setDateRange({ ...dateRange, startDate: e.target.value })
              }
            />
          </div>

          <div>
            <label className="form-label">Tanggal Akhir</label>
            <input
              type="date"
              className="form-input"
              value={dateRange.endDate}
              onChange={(e) =>
                setDateRange({ ...dateRange, endDate: e.target.value })
              }
            />
          </div>
        </div>
      </div>

      {/* Profit Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card bg-green-50">
          <div className="flex items-center flex-wrap">
            <div className="p-3 rounded-full bg-green-500">
              <FiDollarSign className="text-white" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                Total Keuntungan
              </p>
              <p className="text-xl font-bold text-green-600">
                Rp {formatCurrency(profitSummary.totalProfit)}
              </p>
            </div>
          </div>
        </div>

        <div className="card bg-blue-50">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-blue-500">
              <FiTrendingUp className="text-white" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                Transaksi Menguntungkan
              </p>
              <p className="text-xl font-bold text-blue-600">
                {profitSummary.profitableProducts}
              </p>
            </div>
          </div>
        </div>

        <div className="card bg-yellow-50">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-yellow-500">
              <FiDollarSign className="text-white" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Transaksi</p>
              <p className="text-xl font-bold text-yellow-600">
                {profitSummary.totalProducts}
              </p>
            </div>
          </div>
        </div>

        <div className="card bg-purple-50">
          <div className="flex items-center">
            <div className="p-3 rounded-full bg-purple-500">
              <FiDollarSign className="text-white" size={24} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                Rata-rata Keuntungan per Transaksi
              </p>
              <p className="text-xl font-bold text-purple-600">
                Rp{" "}
                {formatCurrency(stats.averageProfit)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Individual Product Profits */}
      {productProfits.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Total Keuntungan Per Produk
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {productProfits.slice(0, 6).map((product, index) => (
              <div
                key={index}
                className="p-4 bg-green-50 border border-green-200 rounded-lg"
              >
                <p className="font-medium text-gray-900">{product.name}</p>
                <p className="text-sm text-gray-600">{product.code}</p>
                <p className="text-lg font-bold text-green-600">
                  Rp {formatCurrency(product.profit)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Edit Harga Transaksi - {editingProduct?.name}
            </h3>
            
            <p className="text-sm text-gray-600 mb-4">
              Harga yang diubah hanya akan mempengaruhi transaksi ini saja, tidak akan mempengaruhi transaksi lain dengan produk yang sama.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">ID Transaksi</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.outgoing_goods_id}
                  readOnly
                />
              </div>

              <div>
                <label className="form-label">Harga Beli</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={formData.purchase_price}
                  onChange={(e) => {
                    const value = e.target.value
                    // Prevent negative values (allow 0 for price)
                    if (value === '' || (parseFloat(value) >= 0)) {
                      setFormData({ ...formData, purchase_price: value })
                    }
                  }}
                  placeholder="0.00"
                  required
                  min="0"
                />
              </div>

              <div>
                <label className="form-label">Harga Jual</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={formData.selling_price}
                  onChange={(e) => {
                    const value = e.target.value
                    // Prevent negative values (allow 0 for price)
                    if (value === '' || (parseFloat(value) >= 0)) {
                      setFormData({ ...formData, selling_price: value })
                    }
                  }}
                  placeholder="0.00"
                  required
                  min="0"
                />
              </div>

              <div>
                <label className="form-label">Potongan Harga</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={formData.discount}
                  onChange={(e) => {
                    const value = e.target.value
                    // Prevent negative values (allow 0 for discount)
                    if (value === '' || (parseFloat(value) >= 0)) {
                      setFormData({ ...formData, discount: value })
                    }
                  }}
                  placeholder="0.00"
                  min="0"
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
                  {loading ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pembukuan Table */}
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
                    <th>Kode</th>
                    <th>Nama Produk</th>
                    <th>Kategori</th>
                    <th>Merk</th>
                    <th>Jumlah Keluar</th>
                    <th>No. Resi</th>
                    <th>Harga Beli</th>
                    <th>Harga Jual</th>
                    <th>Potongan</th>
                    <th>Margin</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {pembukuan.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.date).toLocaleDateString('id-ID')}</td>
                      <td>{item.code}</td>
                      <td>{item.name}</td>
                      <td>{item.category}</td>
                      <td>{item.brand}</td>
                      <td>
                        <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                          -{item.quantity || 0}
                        </span>
                      </td>
                      <td>{item.resi_number || "-"}</td>
                      <td>
                        {parseFloat(item.purchase_price) > 0 ? (
                          <span className="text-blue-600 font-medium">
                            Rp {formatCurrency(item.purchase_price)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td>
                        {parseFloat(item.selling_price) > 0 ? (
                          <span className="text-green-600 font-medium">
                            Rp {formatCurrency(item.selling_price)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td>
                        {parseFloat(item.discount) > 0 ? (
                          <span className="text-orange-600 font-medium">
                            Rp {formatCurrency(item.discount)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td>
                        {parseFloat(item.margin) > 0 ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                            Rp {formatCurrency(item.margin)}
                          </span>
                        ) : parseFloat(item.margin) < 0 ? (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                            Rp {formatCurrency(item.margin)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleEdit(item)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit Harga"
                        >
                          <FiEdit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pembukuan.length === 0 && (
                <div className="text-center py-8">
                  <FiDollarSign
                    className="mx-auto text-gray-400 mb-4"
                    size={48}
                  />
                  <p className="text-gray-500">Tidak ada data pembukuan</p>
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
  );
}
