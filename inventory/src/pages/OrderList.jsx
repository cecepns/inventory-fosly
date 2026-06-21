import { useState, useEffect, useRef, useCallback } from "react";
import {
  FiPlus,
  FiShoppingCart,
  FiSearch,
  FiEdit2,
  FiTrash2,
  FiDownload,
  FiFileText,
} from "react-icons/fi";
import api from "../utils/api";
import { useNotification } from "../contexts/NotificationContext";
import ProductSelect from "../components/ProductSelect";
import { usePagination } from "../hooks/usePagination";
import Pagination from "../components/Pagination";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";

export default function OrderList() {
  const [incomingGoods, setIncomingGoods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Set default dates: 7 days before today for start, 7 days from today for end
  const getDefaultStartDate = () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return sevenDaysAgo.toISOString().split("T")[0];
  };

  const getDefaultEndDate = () => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return sevenDaysFromNow.toISOString().split("T")[0];
  };

  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [showComparison, setShowComparison] = useState(false);
  const [formData, setFormData] = useState({
    product_code: "",
    product_name: "",
    category: "",
    brand: "",
    quantity: "",
    price: "",
    resi_number: "",
    bank: "",
    date: new Date().toISOString().split("T")[0],
  });
  const { showSuccess, showError } = useNotification();
  const printRef = useRef();

  // Fetch function for pagination
  const fetchOrders = async (params) => {
    const response = await api.get("/api/orders", { params });
    return response;
  };

  // Fetch function for summary pagination
  const fetchOrderSummary = async (params) => {
    const response = await api.get("/api/orders/summary", { params });
    return response;
  };

  // Use pagination hook for detailed orders
  const {
    data: orders,
    loading: dataLoading,
    pagination,
    goToPage,
    updateParams,
    refresh,
  } = usePagination(fetchOrders);

  // Use pagination hook for order summary
  const {
    data: orderSummaryData,
    loading: summaryLoading,
    pagination: summaryPagination,
    goToPage: goToSummaryPage,
    updateParams: updateSummaryParams,
    refresh: refreshSummary,
  } = usePagination(fetchOrderSummary);

  // Separate search for summary
  const [summarySearchTerm, setSummarySearchTerm] = useState("");

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: "Laporan Order List",
  });

  // Fetch incoming goods for comparison
  const fetchIncomingGoods = useCallback(async () => {
    try {
      // Get current product codes from orders
      const currentProductCodes = [
        ...new Set(orders.map((order) => order.product_code)),
      ];

      // Build query parameters
      const params = new URLSearchParams();
      if (currentProductCodes.length > 0) {
        params.append("productCodes", currentProductCodes.join(","));
      }
      if (startDate) {
        params.append("startDate", startDate);
      }
      if (endDate) {
        params.append("endDate", endDate);
      }

      const response = await api.get(
        `/api/incoming-goods/for-comparison?${params}`
      );
      setIncomingGoods(response.data.data || []);
    } catch (error) {
      console.error("Error fetching incoming goods:", error);
      setIncomingGoods([]);
    }
  }, [startDate, endDate]);

  // Fetch incoming goods when comparison is enabled
  useEffect(() => {
    if (showComparison) {
      fetchIncomingGoods();
    }
  }, [showComparison, fetchIncomingGoods]);

  // Fetch incoming goods when date range changes (only if comparison is active)
  useEffect(() => {
    if (showComparison) {
      fetchIncomingGoods();
    }
  }, [startDate, endDate, fetchIncomingGoods]);

  // Update search params
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const params = { search: searchTerm };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      updateParams(params);
    }, 500); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [searchTerm, startDate, endDate]);

  // Update summary search params
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const params = { search: summarySearchTerm };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      updateSummaryParams(params);
    }, 500); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [summarySearchTerm, startDate, endDate, updateSummaryParams]);

  const handleProductChange = (product) => {
    if (product) {
      setFormData({
        ...formData,
        product_code: product.code,
        product_name: product.name,
        category: product.category,
        brand: product.brand,
      });
    } else {
      setFormData({
        ...formData,
        product_code: "",
        product_name: "",
        category: "",
        brand: "",
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingOrder) {
        await api.put(`/api/orders/${editingOrder.id}`, formData);
        showSuccess("Order berhasil diperbarui");
      } else {
        await api.post("/api/orders", formData);
        showSuccess("Order berhasil ditambahkan");
      }

      resetForm();
      refresh();
      refreshSummary();
    } catch (error) {
      showError(error.response?.data?.message || "Gagal menyimpan order");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (order) => {
    setEditingOrder(order);

    // Format date for HTML date input (YYYY-MM-DD)
    const formatDateForInput = (dateString) => {
      if (!dateString) return new Date().toISOString().split("T")[0];
      const date = new Date(dateString);
      return date.toISOString().split("T")[0];
    };

    setFormData({
      product_code: order.product_code,
      product_name: order.product_name,
      category: order.category,
      brand: order.brand,
      quantity: order.quantity,
      price: order.price,
      resi_number: order.resi_number,
      bank: order.bank || "",
      date: formatDateForInput(order.date),
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Apakah Anda yakin ingin menghapus order ini?")) {
      try {
        await api.delete(`/api/orders/${id}`);
        showSuccess("Order berhasil dihapus");
        refresh();
      } catch (error) {
        console.error("Error deleting order:", error);
        showError("Gagal menghapus order");
      }
    }
  };

  const resetForm = () => {
    setFormData({
      product_code: "",
      product_name: "",
      category: "",
      brand: "",
      quantity: "",
      price: "",
      resi_number: "",
      bank: "",
      date: new Date().toISOString().split("T")[0],
    });
    setEditingOrder(null);
    setShowForm(false);
  };

  // Compare orders with incoming goods - FIXED LOGIC
  const getComparisonData = () => {
    const incomingGoodsArray = Array.isArray(incomingGoods)
      ? incomingGoods
      : [];

    // Debug: Log the data being compared
    if (showComparison && orders.length > 0 && incomingGoodsArray.length > 0) {
      console.log("=== COMPARISON DEBUG ===");
      console.log("Orders sample:", orders.slice(0, 3));
      console.log("Incoming goods sample:", incomingGoodsArray.slice(0, 3));
      console.log("Product codes from orders:", [
        ...new Set(orders.map((order) => order.product_code)),
      ]);
      console.log("Product codes from incoming:", [
        ...new Set(incomingGoodsArray.map((incoming) => incoming.product_code)),
      ]);
      console.log("=======================");
    }

    return orders.map((order) => {
      // Helper function to check if dates are within tolerance (3 days)
      const isDateWithinTolerance = (date1, date2, toleranceDays = 3) => {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= toleranceDays;
      };

      // Find exact matches first (same product, resi, quantity, and date within tolerance)
      const exactMatches = incomingGoodsArray.filter(
        (incoming) =>
          incoming.product_name === order.product_name &&
          incoming.resi_number === order.resi_number &&
          parseInt(incoming.quantity) === parseInt(order.quantity) &&
          isDateWithinTolerance(incoming.date, order.date)
      );

      // If we have exact matches, use the first one
      const matchingIncoming = exactMatches.length > 0 ? exactMatches[0] : null;

      // If no exact match, find matches with same product and resi (date tolerance)
      const sameProductResiMatches = incomingGoodsArray.filter(
        (incoming) =>
          incoming.product_name === order.product_name &&
          incoming.resi_number === order.resi_number &&
          isDateWithinTolerance(incoming.date, order.date)
      );

      // If no product+resi match, find matches with same product only (date tolerance)
      const sameProductMatches = incomingGoodsArray.filter(
        (incoming) =>
          incoming.product_name === order.product_name &&
          isDateWithinTolerance(incoming.date, order.date)
      );

      // Determine which fields don't match
      const fieldMismatches = {
        product_name: false,
        resi_number: false,
        quantity: false,
        date: false,
      };

      let closestMatch = null;
      let matchType = "none";

      if (matchingIncoming) {
        // Perfect match found - all fields match
        closestMatch = matchingIncoming;
        matchType = "exact";
        fieldMismatches.product_name = false;
        fieldMismatches.resi_number = false;
        fieldMismatches.quantity = false;
        fieldMismatches.date = false;
      } else if (sameProductResiMatches.length > 0) {
        // Same product and resi, but different quantity
        closestMatch = sameProductResiMatches[0];
        matchType = "product_resi";
        fieldMismatches.product_name = false;
        fieldMismatches.resi_number = false;
        fieldMismatches.quantity =
          parseInt(closestMatch.quantity) !== parseInt(order.quantity);
        fieldMismatches.date = false;
      } else if (sameProductMatches.length > 0) {
        // Same product only
        closestMatch = sameProductMatches[0];
        matchType = "product_only";
        fieldMismatches.product_name = false;
        fieldMismatches.resi_number =
          closestMatch.resi_number !== order.resi_number;
        fieldMismatches.quantity =
          parseInt(closestMatch.quantity) !== parseInt(order.quantity);
        fieldMismatches.date = false;
      } else {
        // No match found at all
        matchType = "none";
        fieldMismatches.product_name = true;
        fieldMismatches.resi_number = true;
        fieldMismatches.quantity = true;
        fieldMismatches.date = true;
      }

      return {
        ...order,
        hasMatch: !!matchingIncoming, // Only true for perfect matches
        matchingIncoming,
        closestMatch,
        fieldMismatches,
        matchType,
      };
    });
  };

  // Helper function to get CSS class for field highlighting
  const getFieldClass = (order, fieldName) => {
    if (!showComparison) return "";
    // For perfect matches (exact), no red background
    if (order.hasMatch) return "";
    // For all other cases, show red background for mismatched fields
    return order.fieldMismatches && order.fieldMismatches[fieldName]
      ? "bg-red-100"
      : "";
  };

  const exportToExcel = () => {
    const comparisonData = getComparisonData();
    const exportData = comparisonData.map((item) => ({
      Tanggal: formatDate(item.date),
      Kode: item.product_code,
      "Nama Barang": item.product_name,
      Kategori: item.category,
      Merk: item.brand,
      Jumlah: item.quantity,
      Harga: parseFloat(item.price),
      Total: parseFloat(item.price) * parseInt(item.quantity),
      Resi: item.resi_number,
      Bank: item.bank || "",
      Status: item.hasMatch
        ? "Exact Match"
        : item.matchType === "product_resi"
        ? "Product+Resi Match"
        : item.matchType === "product_only"
        ? "Product Only Match"
        : "No Match",
    }));

    // Add filter information if date range is active
    if (isCustomDateRange()) {
      const filterInfo = {
        Tanggal: "",
        Kode: "",
        "Nama Barang": "",
        Kategori: "",
        Merk: "",
        Jumlah: "",
        Harga: "",
        Total: "",
        Resi: "",
        Bank: "",
        Status: `Filter: ${startDate ? `Dari ${formatDate(startDate)}` : ""} ${
          endDate ? `Sampai ${formatDate(endDate)}` : ""
        }`,
      };
      exportData.unshift(filterInfo);
      exportData.unshift({}); // Empty row for spacing
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Order List");

    // Generate filename with date range if applicable
    let filename = `order-list-${new Date().toISOString().split("T")[0]}`;
    if (isCustomDateRange()) {
      if (startDate && endDate) {
        filename += `-${startDate}-to-${endDate}`;
      } else if (startDate) {
        filename += `-from-${startDate}`;
      } else if (endDate) {
        filename += `-until-${endDate}`;
      }
    }
    filename += ".xlsx";

    XLSX.writeFile(wb, filename);

    showSuccess("Data berhasil diexport ke Excel");
  };

  const exportToPDF = () => {
    handlePrint();
  };

  // Clear date filters
  const clearDateFilters = () => {
    setStartDate(getDefaultStartDate());
    setEndDate(getDefaultEndDate());
  };

  // Check if custom date range is active (different from defaults)
  const isCustomDateRange = () => {
    const defaultStart = getDefaultStartDate();
    const defaultEnd = getDefaultEndDate();
    return startDate !== defaultStart || endDate !== defaultEnd;
  };

  // Helper function to format date correctly (fix timezone issue)
  const formatDate = (dateString) => {
    if (!dateString) return "";
    // Create date and add 1 day to fix the timezone offset issue
    const date = new Date(dateString);
    date.setDate(date.getDate() + 1);
    return date.toLocaleDateString("id-ID");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-2">
        <h1 className="text-2xl font-bold text-gray-900 min-w-fit">
          List Order Barang
        </h1>
        <div className="flex md:space-x-2 justify-end gap-2 flex-col md:flex-row items-center w-full md:w-auto">
          <button
            onClick={() => setShowComparison(!showComparison)}
            className="btn btn-secondary flex items-center w-full md:w-auto"
          >
            <FiSearch className="mr-2" />
            {showComparison ? "Sembunyikan" : "Tampilkan"} Perbandingan
          </button>
          <button
            onClick={exportToExcel}
            className="btn btn-success flex items-center w-full md:w-auto"
          >
            <FiDownload className="mr-2" />
            Export Excel
          </button>
          <button
            onClick={exportToPDF}
            className="btn btn-primary flex items-center w-full md:w-auto"
          >
            <FiFileText className="mr-2" />
            Export PDF
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center w-full md:w-auto"
          >
            <FiPlus className="mr-2" />
            Tambah Order
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Filter Rentang Waktu
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="form-label">Tanggal Mulai</label>
            <input
              type="date"
              className="form-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="form-label">Tanggal Akhir</label>
            <input
              type="date"
              className="form-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={clearDateFilters}
              className="btn btn-secondary w-full"
            >
              Reset ke Default
            </button>
          </div>
        </div>
        {isCustomDateRange() && (
          <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Filter Aktif:</strong>
              {startDate && ` Dari ${formatDate(startDate)}`}
              {endDate && ` Sampai ${formatDate(endDate)}`}
            </p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingOrder ? "Edit Order" : "Tambah Order"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Tanggal</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="form-label">Pilih Produk</label>
                <ProductSelect
                  value={formData.product_code}
                  onChange={handleProductChange}
                  placeholder="Cari dan pilih produk..."
                  disableOutOfStock={false}
                />
              </div>

              <div>
                <label className="form-label">Nama Barang</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.product_name}
                  readOnly
                />
              </div>

              <div>
                <label className="form-label">Kategori</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.category}
                  readOnly
                />
              </div>

              <div>
                <label className="form-label">Merk</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.brand}
                  readOnly
                />
              </div>

              <div>
                <label className="form-label">Jumlah</label>
                <input
                  type="number"
                  className="form-input"
                  value={formData.quantity}
                  onChange={(e) => {
                    const value = e.target.value
                    // Prevent 0 and negative values
                    if (value === '' || (parseInt(value) > 0)) {
                      setFormData({ ...formData, quantity: value })
                    }
                  }}
                  required
                  min="1"
                />
              </div>

              <div>
                <label className="form-label">Harga per Unit</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={formData.price}
                  onChange={(e) => {
                    const value = e.target.value
                    // Prevent negative values (allow 0 for price)
                    if (value === '' || (parseFloat(value) >= 0)) {
                      setFormData({ ...formData, price: value })
                    }
                  }}
                  placeholder="0.00"
                  required
                  min="0"
                />
              </div>

              <div>
                <label className="form-label">Nomor Resi</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.resi_number}
                  onChange={(e) =>
                    setFormData({ ...formData, resi_number: e.target.value })
                  }
                  placeholder="Masukkan nomor resi"
                  required
                />
              </div>

              <div>
                <label className="form-label">Bank</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.bank}
                  onChange={(e) =>
                    setFormData({ ...formData, bank: e.target.value })
                  }
                  placeholder="Masukkan nama bank"
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

      {/* Order Summary with separate pagination */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Ringkasan Order
        </h3>

        {/* Summary Search */}
        <div className="mb-4">
          <div className="relative">
            <FiSearch
              className="absolute left-3 top-3 text-gray-400"
              size={20}
            />
            <input
              type="text"
              placeholder="Cari ringkasan order..."
              className="form-input pl-10"
              value={summarySearchTerm}
              onChange={(e) => setSummarySearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Barang</th>
                <th>Kategori</th>
                <th>Merk</th>
                <th>Total Quantity</th>
                <th>Total Order</th>
                <th>Harga Rata-rata</th>
              </tr>
            </thead>
            <tbody>
              {summaryLoading ? (
                <tr>
                  <td colSpan="7" className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
                  </td>
                </tr>
              ) : orderSummaryData && orderSummaryData.length > 0 ? (
                orderSummaryData.map((summary, index) => (
                  <tr key={index}>
                    <td>{summary.product_code}</td>
                    <td>{summary.product_name}</td>
                    <td>{summary.category}</td>
                    <td>{summary.brand}</td>
                    <td>{summary.total_quantity}</td>
                    <td>{summary.total_orders}</td>
                    <td>
                      <span className="font-semibold text-green-600">
                        Rp {parseFloat(summary.average_price).toLocaleString("id-ID", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        })}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-8">
                    <FiShoppingCart
                      className="mx-auto text-gray-400 mb-4"
                      size={48}
                    />
                    <p className="text-gray-500">Tidak ada data order</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Summary Pagination */}
        <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Items per page selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Tampilkan:</label>
            <select
              className="form-select text-sm"
              value={summaryPagination.limit}
              onChange={(e) => {
                updateSummaryParams({
                  limit: parseInt(e.target.value),
                  page: 1,
                });
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span className="text-sm text-gray-600">
              dari {summaryPagination.total} item
            </span>
          </div>

          {/* Pagination */}
          {summaryPagination.totalPages > 1 && (
            <Pagination
              currentPage={summaryPagination.page}
              totalPages={summaryPagination.totalPages}
              totalItems={summaryPagination.total}
              itemsPerPage={summaryPagination.limit}
              onPageChange={goToSummaryPage}
            />
          )}
        </div>
      </div>

      {/* Detailed Orders with Comparison */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Detail Order {showComparison && "(dengan Perbandingan Barang Masuk)"}
        </h3>

        <div className="relative mb-4">
          <FiSearch className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Cari order..."
            className="form-input pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {showComparison && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Keterangan Perbandingan:</strong>
            </p>
            <ul className="text-sm text-yellow-800 mt-1 space-y-1">
              <li>
                • <strong>Exact Match:</strong> Nama Barang, Resi, Jumlah, dan
                Tanggal (±3 hari) sama
              </li>
              <li>
                • <strong>Product + Resi Match:</strong> Nama Barang dan Resi
                sama, Jumlah berbeda
              </li>
              <li>
                • <strong>Product Only:</strong> Hanya Nama Barang sama, Resi
                dan Jumlah berbeda
              </li>
              <li>
                • <strong>No Match:</strong> Tidak ada data barang masuk yang
                cocok
              </li>
              <li>
                • Field dengan background merah menunjukkan field yang tidak
                match
              </li>
            </ul>
          </div>
        )}

        {dataLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
          </div>
        ) : (
          <>
            <div ref={printRef} className="overflow-x-auto">
              <div className="print-header mb-6 text-center">
                <h2 className="text-xl font-bold">Laporan Order List</h2>
                <p className="text-gray-600">
                  Dicetak pada: {new Date().toLocaleDateString("id-ID")}
                </p>
                {isCustomDateRange() && (
                  <p className="text-gray-600 text-sm">
                    Filter: {startDate ? `Dari ${formatDate(startDate)}` : ""}{" "}
                    {endDate ? `Sampai ${formatDate(endDate)}` : ""}
                  </p>
                )}
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Kode</th>
                    <th>Nama Barang</th>
                    <th>Kategori</th>
                    <th>Merk</th>
                    <th>Jumlah</th>
                    <th>Harga</th>
                    <th>Total</th>
                    <th>Resi</th>
                    <th>Bank</th>
                    {showComparison && <th>Status</th>}
                    <th className="no-print">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(showComparison ? getComparisonData() : orders).map(
                    (order) => (
                      <tr
                        key={order.id}
                        className={
                          showComparison && order.matchType === "none"
                            ? "bg-red-50"
                            : ""
                        }
                      >
                        <td>{formatDate(order.date)}</td>
                        <td>{order.product_code}</td>
                        <td className={getFieldClass(order, "product_name")}>
                          {order.product_name}
                        </td>
                        <td>{order.category}</td>
                        <td>{order.brand}</td>
                        <td className={getFieldClass(order, "quantity")}>
                          {order.quantity}
                        </td>
                        <td>
                          Rp {parseFloat(order.price).toLocaleString("id-ID")}
                        </td>
                        <td>
                          <span className="font-semibold text-primary-600">
                            Rp{" "}
                            {(
                              parseFloat(order.price) * parseInt(order.quantity)
                            ).toLocaleString("id-ID")}
                          </span>
                        </td>
                        <td className={getFieldClass(order, "resi_number")}>
                          {order.resi_number}
                        </td>
                        <td>{order.bank || "-"}</td>
                        {showComparison && (
                          <td>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                order.hasMatch
                                  ? "bg-green-100 text-green-800"
                                  : order.matchType === "product_resi"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : order.matchType === "product_only"
                                  ? "bg-orange-100 text-orange-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {order.hasMatch
                                ? "Exact Match"
                                : order.matchType === "product_resi"
                                ? "Product+Resi"
                                : order.matchType === "product_only"
                                ? "Product Only"
                                : "No Match"}
                            </span>
                            {order.closestMatch && !order.hasMatch && (
                              <div className="mt-1 text-xs text-gray-600">
                                <div>Closest match:</div>
                                <div>
                                  Resi: {order.closestMatch.resi_number}
                                </div>
                                <div>Qty: {order.closestMatch.quantity}</div>
                                <div>
                                  Date: {formatDate(order.closestMatch.date)}
                                </div>
                              </div>
                            )}
                          </td>
                        )}
                        <td className="no-print">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEdit(order)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <FiEdit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(order.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <FiTrash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination - always show, even in comparison mode */}
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
