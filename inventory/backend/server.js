const express = require('express')
const cors = require('cors')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())

// Database connection live
// const dbConfig = {
//   host: "localhost",
//   user: "isad8273_inventory",
//   password: "isad8273_inventory",
//   database: "isad8273_inventory",
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// }

// Database connection local
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "inventory_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
}
// const dbConfig = {
//   host: process.env.DB_HOST || 'localhost',
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASSWORD || '',
//   database: process.env.DB_NAME || 'inventory_db'
// }

// let db

// const connectDB = async () => {
//   try {
//     db = await mysql.createConnection(dbConfig)
//     console.log('Connected to MySQL database')
//   } catch (error) {
//     console.error('Database connection failed:', error)
//     // process.exit(1)
//   }
// }

const db = mysql.createPool(dbConfig);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ message: 'Access token required' })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' })
    }
    req.user = user
    next()
  })
}

// Role-based access control middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' })
    }
    next()
  }
}

// Log activity function
const logActivity = async (userId, action, details) => {
  try {
    await db.execute(
      'INSERT INTO activity_logs (user_id, action, details, timestamp) VALUES (?, ?, ?, NOW())',
      [userId, action, details]
    )
  } catch (error) {
    console.error('Error logging activity:', error)
  }
}

// Helper function for pagination
const getPaginationParams = (req) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 10
  const offset = (page - 1) * limit
  const search = req.query.search || ''
  const sort = req.query.sort || ''
  
  return { page, limit, offset, search, sort }
}

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Check if user exists
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email])
    
    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const user = users[0]
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password)
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    // Log login activity
    await logActivity(user.id, 'LOGIN', `User ${user.email} logged in`)

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ user: req.user })
})

// Dashboard Routes
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const { period = 'all' } = req.query
    
    let dateFilter = ''
    
    switch (period) {
      case 'today':
        dateFilter = `WHERE DATE(date) = CURDATE()`
        break
      case 'week':
        dateFilter = `WHERE WEEK(date) = WEEK(NOW()) AND YEAR(date) = YEAR(NOW())`
        break
      case 'month':
        dateFilter = `WHERE MONTH(date) = MONTH(NOW()) AND YEAR(date) = YEAR(NOW())`
        break
      case 'year':
        dateFilter = `WHERE YEAR(date) = YEAR(NOW())`
        break
      case 'all':
      default:
        dateFilter = '' // No date filter for all-time stats
    }

    // Total stock (current stock from products table)
    const [totalStockResult] = await db.execute(
      'SELECT SUM(current_stock) as total FROM products'
    )
    const totalStock = totalStockResult[0].total || 0

    // Total initial stock
    const [totalInitialStockResult] = await db.execute(
      'SELECT SUM(initial_stock) as total FROM products'
    )
    const totalInitialStock = totalInitialStockResult[0].total || 0

    // Incoming goods (period-based)
    const [incomingResult] = await db.execute(
      `SELECT SUM(quantity) as total FROM incoming_goods ${dateFilter}`
    )
    const incomingGoods = incomingResult[0].total || 0

    // Outgoing goods (period-based)
    const [outgoingResult] = await db.execute(
      `SELECT SUM(quantity) as total FROM outgoing_goods ${dateFilter}`
    )
    const outgoingGoods = outgoingResult[0].total || 0

    // Total incoming goods (all-time)
    const [totalIncomingResult] = await db.execute(
      'SELECT SUM(quantity) as total FROM incoming_goods'
    )
    const totalIncomingGoods = totalIncomingResult[0].total || 0

    // Total outgoing goods (all-time)
    const [totalOutgoingResult] = await db.execute(
      'SELECT SUM(quantity) as total FROM outgoing_goods'
    )
    const totalOutgoingGoods = totalOutgoingResult[0].total || 0

    // Calculated stock (should match totalStock if data is consistent)
    const calculatedStock = totalInitialStock + totalIncomingGoods - totalOutgoingGoods

    // Top stock products
    const [topStockProducts] = await db.execute(
      'SELECT code, name, current_stock as stock FROM products ORDER BY current_stock DESC LIMIT 5'
    )

    // Most outgoing products
    const [mostOutgoingProducts] = await db.execute(
      `SELECT p.code, p.name, SUM(og.quantity) as total_out 
       FROM products p 
       JOIN outgoing_goods og ON p.code = og.product_code 
       ${dateFilter}
       GROUP BY p.code, p.name 
       ORDER BY total_out DESC 
       LIMIT 5`
    )

    // Out of stock products
    const [outOfStockProducts] = await db.execute(
      'SELECT code, name, current_stock as stock FROM products WHERE current_stock <= 0'
    )

    // Top 5 most out of stock products (products with highest historical outgoing quantity that are currently out of stock)
    const [topOutOfStockProducts] = await db.execute(
      `SELECT p.code, p.name, p.current_stock as stock, COALESCE(SUM(og.quantity), 0) as total_outgoing
       FROM products p
       LEFT JOIN outgoing_goods og ON p.code = og.product_code
       WHERE p.current_stock <= 0
       GROUP BY p.code, p.name, p.current_stock
       ORDER BY total_outgoing DESC
       LIMIT 5`
    )

    res.json({
      totalStock,
      totalInitialStock,
      incomingGoods,
      outgoingGoods,
      totalIncomingGoods,
      totalOutgoingGoods,
      calculatedStock,
      stockConsistency: {
        isConsistent: totalStock === calculatedStock,
        difference: totalStock - calculatedStock
      },
      topStockProducts: topStockProducts || [],
      mostOutgoingProducts: mostOutgoingProducts || [],
      outOfStockProducts: outOfStockProducts || [],
      topOutOfStockProducts: topOutOfStockProducts || []
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Products Routes
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const { page, limit, offset, search, sort } = getPaginationParams(req)
    
    let whereClause = ''
    let params = []
    
    if (search) {
      whereClause = 'WHERE name LIKE ? OR code LIKE ? OR category LIKE ? OR brand LIKE ?'
      params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
    }
    
    // Determine sort order
    let orderClause = 'ORDER BY name ASC' // default sort
    if (sort === 'name_desc') {
      orderClause = 'ORDER BY name DESC'
    } else if (sort === 'brand') {
      orderClause = 'ORDER BY brand ASC'
    } else if (sort === 'brand_desc') {
      orderClause = 'ORDER BY brand DESC'
    } else if (sort === 'date') {
      orderClause = 'ORDER BY id ASC' // Using id as proxy for creation date
    } else if (sort === 'date_desc') {
      orderClause = 'ORDER BY id DESC'
    }
    
    // Get total count
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM products ${whereClause}`,
      params
    )
    const total = countResult[0].total
    
    // Get paginated data
    const [products] = await db.execute(
      `SELECT * FROM products ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    
    res.json({
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get products error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Get all products (for select components)
app.get('/api/products/all', authenticateToken, async (req, res) => {
  try {
    const [products] = await db.execute(
      'SELECT * FROM products ORDER BY name'
    )
    
    res.json({
      data: products
    })
  } catch (error) {
    console.error('Get all products error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Get product by barcode
app.get('/api/products/barcode/:barcode', authenticateToken, async (req, res) => {
  try {
    const { barcode } = req.params
    
    const [products] = await db.execute(
      'SELECT * FROM products WHERE barcode_id = ?',
      [barcode]
    )
    
    if (products.length === 0) {
      return res.status(404).json({ message: 'Produk tidak ditemukan' })
    }
    
    res.json({
      data: products[0]
    })
  } catch (error) {
    console.error('Get product by barcode error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/products', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { barcode_id, code, name, initial_stock, category, brand } = req.body
    
    // Check if product code already exists
    const [existing] = await db.execute('SELECT id FROM products WHERE code = ?', [code])
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Kode barang sudah digunakan' })
    }

    const [result] = await db.execute(
      'INSERT INTO products (barcode_id, code, name, initial_stock, current_stock, category, brand) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [barcode_id, code, name, initial_stock, initial_stock, category, brand]
    )
    
    // Log activity
    await logActivity(req.user.id, 'CREATE_PRODUCT', `Created product: ${name} (${code})`)
    
    res.status(201).json({ id: result.insertId, message: 'Product created successfully' })
  } catch (error) {
    console.error('Create product error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.put('/api/products/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    const { barcode_id, code, name, initial_stock, category, brand } = req.body
    
    await db.execute(
      'UPDATE products SET barcode_id = ?, code = ?, name = ?, initial_stock = ?, category = ?, brand = ? WHERE id = ?',
      [barcode_id, code, name, initial_stock, category, brand, id]
    )
    
    // Log activity
    await logActivity(req.user.id, 'UPDATE_PRODUCT', `Updated product: ${name} (${code})`)
    
    res.json({ message: 'Product updated successfully' })
  } catch (error) {
    console.error('Update product error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.delete('/api/products/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    
    // Get product info for logging
    const [product] = await db.execute('SELECT name, code FROM products WHERE id = ?', [id])
    
    await db.execute('DELETE FROM products WHERE id = ?', [id])
    
    // Log activity
    if (product.length > 0) {
      await logActivity(req.user.id, 'DELETE_PRODUCT', `Deleted product: ${product[0].name} (${product[0].code})`)
    }
    
    res.json({ message: 'Product deleted successfully' })
  } catch (error) {
    console.error('Delete product error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Bulk insert incoming goods from orders
app.post('/api/incoming-goods/bulk-insert', authenticateToken, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const { orderIds } = req.body
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'Order IDs are required' })
    }
    
    // Get orders data
    const placeholders = orderIds.map(() => '?').join(',')
    const [orders] = await db.execute(
      `SELECT * FROM orders WHERE id IN (${placeholders})`,
      orderIds
    )
    
    if (orders.length === 0) {
      return res.status(404).json({ message: 'No orders found' })
    }
    
    let successCount = 0
    let errorCount = 0
    const errors = []
    
    // Insert each order as incoming goods
    for (const order of orders) {
      try {
        // Check if product exists
        const [products] = await db.execute('SELECT code FROM products WHERE code = ?', [order.product_code])
        
        if (products.length === 0) {
          errorCount++
          errors.push({
            code: order.product_code,
            name: order.product_name,
            reason: 'Produk tidak ditemukan di database. Silakan tambahkan produk terlebih dahulu.'
          })
          continue
        }
        
        // Use order resi_number or generate unique one
        const resi_number = order.resi_number || `ORD-${order.id}-${Date.now()}`
        
        // Use platform and date from order, with defaults if not available
        const platform = order.bank || 'Order'
        const date = order.date || new Date().toISOString().split('T')[0]
        
        // Insert incoming goods
        await db.execute(
          'INSERT INTO incoming_goods (product_code, product_name, category, brand, resi_number, quantity, platform, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            order.product_code,
            order.product_name,
            order.category,
            order.brand,
            resi_number,
            order.quantity,
            platform,
            date
          ]
        )
        
        successCount++
        
        // Log activity
        await logActivity(req.user.id, 'BULK_INSERT_INCOMING_GOODS', `Bulk inserted incoming goods from order: ${order.product_name} (${order.product_code})`)
      } catch (error) {
        errorCount++
        errors.push({
          code: order.product_code,
          name: order.product_name,
          reason: error.message
        })
      }
    }
    
    res.json({
      message: `Bulk insert completed: ${successCount} berhasil, ${errorCount} gagal`,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Bulk insert incoming goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Incoming Goods Routes
app.get('/api/incoming-goods', authenticateToken, async (req, res) => {
  try {
    const { page, limit, offset, search, sort } = getPaginationParams(req)
    
    let whereClause = ''
    let params = []
    
    if (search) {
      whereClause = 'WHERE product_name LIKE ? OR product_code LIKE ? OR resi_number LIKE ? OR platform LIKE ?'
      params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
    }
    
    // Determine sort order
    let orderClause = 'ORDER BY date DESC, id DESC' // default sort
    if (sort === 'brand') {
      orderClause = 'ORDER BY brand ASC, date DESC, id DESC'
    } else if (sort === 'brand_desc') {
      orderClause = 'ORDER BY brand DESC, date DESC, id DESC'
    }
    
    // Get total count
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM incoming_goods ${whereClause}`,
      params
    )
    const total = countResult[0].total
    
    // Get paginated data
    const [incomingGoods] = await db.execute(
      `SELECT * FROM incoming_goods ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    
    res.json({
      data: incomingGoods,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get incoming goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Get incoming goods for order comparison (based on product codes)
app.get('/api/incoming-goods/for-comparison', authenticateToken, async (req, res) => {
  try {
    const { productCodes, startDate, endDate } = req.query
    
    let whereClause = ''
    let params = []
    
    // If product codes are provided, filter by them
    if (productCodes) {
      const codes = productCodes.split(',')
      const placeholders = codes.map(() => '?').join(',')
      whereClause = `WHERE product_code IN (${placeholders})`
      params = [...codes]
    }
    
    // Add date filter if provided
    if (startDate && endDate) {
      const dateFilter = whereClause ? 'AND' : 'WHERE'
      whereClause += ` ${dateFilter} DATE(date) BETWEEN ? AND ?`
      params.push(startDate, endDate)
    } else if (startDate) {
      const dateFilter = whereClause ? 'AND' : 'WHERE'
      whereClause += ` ${dateFilter} DATE(date) >= ?`
      params.push(startDate)
    } else if (endDate) {
      const dateFilter = whereClause ? 'AND' : 'WHERE'
      whereClause += ` ${dateFilter} DATE(date) <= ?`
      params.push(endDate)
    }
    
    // Get all matching incoming goods (no pagination for comparison)
    const [incomingGoods] = await db.execute(
      `SELECT * FROM incoming_goods ${whereClause} ORDER BY date DESC, id DESC, product_name`,
      params
    )
    
    res.json({
      data: incomingGoods
    })
  } catch (error) {
    console.error('Get incoming goods for comparison error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Check for duplicate resi numbers in incoming goods
app.get('/api/incoming-goods/check-resi/:resiNumber', authenticateToken, async (req, res) => {
  try {
    const { resiNumber } = req.params
    const { excludeId } = req.query
    
    let whereClause = 'WHERE resi_number = ?'
    let params = [resiNumber]
    
    if (excludeId) {
      whereClause += ' AND id != ?'
      params.push(excludeId)
    }
    
    const [duplicates] = await db.execute(
      `SELECT id, product_name, date FROM incoming_goods ${whereClause}`,
      params
    )
    
    res.json({
      isDuplicate: duplicates.length > 0,
      duplicates: duplicates
    })
  } catch (error) {
    console.error('Check resi number error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/incoming-goods', authenticateToken, async (req, res) => {
  try {
    const { product_code, product_name, category, brand, resi_number, quantity, platform, date } = req.body
    
    // Insert incoming goods record
    await db.execute(
      'INSERT INTO incoming_goods (product_code, product_name, category, brand, resi_number, quantity, platform, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [product_code, product_name, category, brand, resi_number, quantity, platform, date]
    )
    
    // Stock is automatically updated by database trigger
    
    // Log activity
    await logActivity(req.user.id, 'INCOMING_GOODS', `Added incoming goods: ${product_name} (${quantity} units)`)
    
    res.status(201).json({ message: 'Incoming goods added successfully' })
  } catch (error) {
    console.error('Create incoming goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.put('/api/incoming-goods/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    const { product_code, product_name, category, brand, resi_number, quantity, platform, date } = req.body
    
    // Get the original record to calculate stock adjustment
    const [originalRecord] = await db.execute('SELECT product_code, quantity FROM incoming_goods WHERE id = ?', [id])
    if (originalRecord.length === 0) {
      return res.status(404).json({ message: 'Record tidak ditemukan' })
    }
    
    const originalQuantity = originalRecord[0].quantity
    const originalProductCode = originalRecord[0].product_code
    
    // Update incoming goods record
    await db.execute(
      'UPDATE incoming_goods SET product_code = ?, product_name = ?, category = ?, brand = ?, resi_number = ?, quantity = ?, platform = ?, date = ? WHERE id = ?',
      [product_code, product_name, category, brand, resi_number, quantity, platform, date, id]
    )
    
    // Manually adjust stock since triggers don't handle UPDATE operations
    // Subtract original quantity and add new quantity
    await db.execute(
      'UPDATE products SET current_stock = current_stock - ? + ? WHERE code = ?',
      [originalQuantity, quantity, product_code]
    )
    
    // If product code changed, also update the original product's stock
    if (originalProductCode !== product_code) {
      await db.execute(
        'UPDATE products SET current_stock = current_stock - ? WHERE code = ?',
        [originalQuantity, originalProductCode]
      )
    }
    
    // Log activity
    await logActivity(req.user.id, 'UPDATE_INCOMING_GOODS', `Updated incoming goods: ${product_name} (${quantity} units)`)
    
    res.json({ message: 'Incoming goods updated successfully' })
  } catch (error) {
    console.error('Update incoming goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.delete('/api/incoming-goods/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    
    // Get incoming goods info for logging and stock adjustment
    const [incomingGoods] = await db.execute('SELECT product_code, product_name, quantity FROM incoming_goods WHERE id = ?', [id])
    if (incomingGoods.length === 0) {
      return res.status(404).json({ message: 'Record tidak ditemukan' })
    }
    
    const { product_code, product_name, quantity } = incomingGoods[0]
    
    // Delete the record
    await db.execute('DELETE FROM incoming_goods WHERE id = ?', [id])
    
    // Manually subtract the quantity from product stock since triggers don't handle DELETE operations
    await db.execute(
      'UPDATE products SET current_stock = current_stock - ? WHERE code = ?',
      [quantity, product_code]
    )
    
    // Log activity
    await logActivity(req.user.id, 'DELETE_INCOMING_GOODS', `Deleted incoming goods: ${product_name} (${quantity} units)`)
    
    res.json({ message: 'Incoming goods deleted successfully' })
  } catch (error) {
    console.error('Delete incoming goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Outgoing Goods Routes
app.get('/api/outgoing-goods', authenticateToken, async (req, res) => {
  try {
    const { page, limit, offset, search, sort } = getPaginationParams(req)
    
    let whereClause = ''
    let params = []
    
    if (search) {
      whereClause = 'WHERE product_name LIKE ? OR product_code LIKE ? OR resi_number LIKE ?'
      params = [`%${search}%`, `%${search}%`, `%${search}%`]
    }
    
    // Determine sort order
    let orderClause = 'ORDER BY date DESC, id DESC' // default sort
    if (sort === 'brand') {
      orderClause = 'ORDER BY brand ASC, date DESC, id DESC'
    } else if (sort === 'brand_desc') {
      orderClause = 'ORDER BY brand DESC, date DESC, id DESC'
    }
    
    // Get total count
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM outgoing_goods ${whereClause}`,
      params
    )
    const total = countResult[0].total
    
    // Get paginated data
    const [outgoingGoods] = await db.execute(
      `SELECT * FROM outgoing_goods ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    
    res.json({
      data: outgoingGoods,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get outgoing goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Check for duplicate resi numbers in outgoing goods
app.get('/api/outgoing-goods/check-resi/:resiNumber', authenticateToken, async (req, res) => {
  try {
    const { resiNumber } = req.params
    const { excludeId } = req.query
    
    let whereClause = 'WHERE resi_number = ?'
    let params = [resiNumber]
    
    if (excludeId) {
      whereClause += ' AND id != ?'
      params.push(excludeId)
    }
    
    const [duplicates] = await db.execute(
      `SELECT id, product_name, date FROM outgoing_goods ${whereClause}`,
      params
    )
    
    res.json({
      isDuplicate: duplicates.length > 0,
      duplicates: duplicates
    })
  } catch (error) {
    console.error('Check resi number error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/outgoing-goods', authenticateToken, async (req, res) => {
  try {
    const { product_code, product_name, category, brand, resi_number, quantity, barcode, date } = req.body
    
    // Check if product has enough stock
    const [products] = await db.execute('SELECT current_stock FROM products WHERE code = ?', [product_code])
    if (products.length === 0) {
      return res.status(400).json({ message: 'Produk tidak ditemukan' })
    }
    
    if (products[0].current_stock < quantity) {
      return res.status(400).json({ message: 'Stok tidak mencukupi' })
    }
    
    // Insert outgoing goods record
    await db.execute(
      'INSERT INTO outgoing_goods (product_code, product_name, category, brand, resi_number, quantity, barcode, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [product_code, product_name, category, brand, resi_number, quantity, barcode, date]
    )
    
    // Stock is automatically updated by database trigger
    
    // Log activity
    await logActivity(req.user.id, 'OUTGOING_GOODS', `Added outgoing goods: ${product_name} (${quantity} units)`)
    
    res.status(201).json({ message: 'Outgoing goods added successfully' })
  } catch (error) {
    console.error('Create outgoing goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.put('/api/outgoing-goods/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    const { product_code, product_name, category, brand, resi_number, quantity, barcode, date } = req.body
    
    // Get the original record to calculate stock adjustment
    const [originalRecord] = await db.execute('SELECT product_code, quantity FROM outgoing_goods WHERE id = ?', [id])
    if (originalRecord.length === 0) {
      return res.status(404).json({ message: 'Record tidak ditemukan' })
    }
    
    const originalQuantity = originalRecord[0].quantity
    const originalProductCode = originalRecord[0].product_code
    
    // Check if product has enough stock (considering the original quantity being returned)
    const [products] = await db.execute('SELECT current_stock FROM products WHERE code = ?', [product_code])
    if (products.length === 0) {
      return res.status(400).json({ message: 'Produk tidak ditemukan' })
    }
    
    const availableStock = products[0].current_stock + originalQuantity
    if (availableStock < quantity) {
      return res.status(400).json({ message: 'Stok tidak mencukupi' })
    }
    
    // Update outgoing goods record
    await db.execute(
      'UPDATE outgoing_goods SET product_code = ?, product_name = ?, category = ?, brand = ?, resi_number = ?, quantity = ?, barcode = ?, date = ? WHERE id = ?',
      [product_code, product_name, category, brand, resi_number, quantity, barcode, date, id]
    )
    
    // Manually adjust stock since triggers don't handle UPDATE operations
    // Return original quantity, then subtract new quantity
    await db.execute(
      'UPDATE products SET current_stock = current_stock + ? - ? WHERE code = ?',
      [originalQuantity, quantity, product_code]
    )
    
    // If product code changed, also update the original product's stock
    if (originalProductCode !== product_code) {
      await db.execute(
        'UPDATE products SET current_stock = current_stock + ? WHERE code = ?',
        [originalQuantity, originalProductCode]
      )
    }
    
    // Log activity
    await logActivity(req.user.id, 'UPDATE_OUTGOING_GOODS', `Updated outgoing goods: ${product_name} (${quantity} units)`)
    
    res.json({ message: 'Outgoing goods updated successfully' })
  } catch (error) {
    console.error('Update outgoing goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.delete('/api/outgoing-goods/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    
    // Get outgoing goods info for logging and stock adjustment
    const [outgoingGoods] = await db.execute('SELECT product_code, product_name, quantity FROM outgoing_goods WHERE id = ?', [id])
    if (outgoingGoods.length === 0) {
      return res.status(404).json({ message: 'Record tidak ditemukan' })
    }
    
    const { product_code, product_name, quantity } = outgoingGoods[0]
    
    // Delete the record
    await db.execute('DELETE FROM outgoing_goods WHERE id = ?', [id])
    
    // Manually return the quantity to product stock since triggers don't handle DELETE operations
    await db.execute(
      'UPDATE products SET current_stock = current_stock + ? WHERE code = ?',
      [quantity, product_code]
    )
    
    // Log activity
    await logActivity(req.user.id, 'DELETE_OUTGOING_GOODS', `Deleted outgoing goods: ${product_name} (${quantity} units)`)
    
    res.json({ message: 'Outgoing goods deleted successfully' })
  } catch (error) {
    console.error('Delete outgoing goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Damaged Goods Routes
app.get('/api/damaged-goods', authenticateToken, async (req, res) => {
  try {
    const { page, limit, offset, search } = getPaginationParams(req)
    
    let whereClause = ''
    let params = []
    
    if (search) {
      whereClause = 'WHERE name LIKE ? OR code LIKE ? OR category LIKE ? OR brand LIKE ?'
      params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
    }
    
    // Get total count
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM damaged_goods ${whereClause}`,
      params
    )
    const total = countResult[0].total
    
    // Get paginated data
    const [damagedGoods] = await db.execute(
      `SELECT * FROM damaged_goods ${whereClause} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    
    res.json({
      data: damagedGoods,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get damaged goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/damaged-goods', authenticateToken, async (req, res) => {
  try {
    const { barcode_id, code, name, stock, category, brand, damage_reason, date } = req.body
    
    const [result] = await db.execute(
      'INSERT INTO damaged_goods (barcode_id, code, name, stock, category, brand, damage_reason, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [barcode_id, code, name, stock, category, brand, damage_reason, date]
    )
    
    // Log activity
    await logActivity(req.user.id, 'DAMAGED_GOODS', `Added damaged goods: ${name} (${stock} units)`)
    
    res.status(201).json({ id: result.insertId, message: 'Damaged goods added successfully' })
  } catch (error) {
    console.error('Create damaged goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.put('/api/damaged-goods/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    const { barcode_id, code, name, stock, category, brand, damage_reason, date } = req.body
    
    await db.execute(
      'UPDATE damaged_goods SET barcode_id = ?, code = ?, name = ?, stock = ?, category = ?, brand = ?, damage_reason = ?, date = ? WHERE id = ?',
      [barcode_id, code, name, stock, category, brand, damage_reason, date, id]
    )
    
    // Log activity
    await logActivity(req.user.id, 'UPDATE_DAMAGED_GOODS', `Updated damaged goods: ${name}`)
    
    res.json({ message: 'Damaged goods updated successfully' })
  } catch (error) {
    console.error('Update damaged goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.delete('/api/damaged-goods/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    
    // Get damaged goods info for logging
    const [damagedGoods] = await db.execute('SELECT name FROM damaged_goods WHERE id = ?', [id])
    
    await db.execute('DELETE FROM damaged_goods WHERE id = ?', [id])
    
    // Log activity
    if (damagedGoods.length > 0) {
      await logActivity(req.user.id, 'DELETE_DAMAGED_GOODS', `Deleted damaged goods: ${damagedGoods[0].name}`)
    }
    
    res.json({ message: 'Damaged goods deleted successfully' })
  } catch (error) {
    console.error('Delete damaged goods error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Reports Routes
app.get('/api/reports', authenticateToken, async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query
    
    let data = {}
    
    if (type === 'stock') {
      const [stockReport] = await db.execute(`
        SELECT 
          p.code,
          p.name,
          p.category,
          p.brand,
          p.initial_stock,
          p.current_stock,
          COALESCE((
            SELECT SUM(ig.quantity)
            FROM incoming_goods ig
            WHERE ig.product_code = p.code AND ig.date BETWEEN ? AND ?
          ), 0) as total_incoming,
          COALESCE((
            SELECT SUM(og.quantity)
            FROM outgoing_goods og
            WHERE og.product_code = p.code AND og.date BETWEEN ? AND ?
          ), 0) as total_outgoing,
          (p.initial_stock +
            COALESCE((SELECT SUM(ig.quantity) FROM incoming_goods ig WHERE ig.product_code = p.code AND ig.date < ?), 0) -
            COALESCE((SELECT SUM(og.quantity) FROM outgoing_goods og WHERE og.product_code = p.code AND og.date < ?), 0)
          ) as stock_at_start,
          (p.initial_stock +
            COALESCE((SELECT SUM(ig.quantity) FROM incoming_goods ig WHERE ig.product_code = p.code AND ig.date < ?), 0) -
            COALESCE((SELECT SUM(og.quantity) FROM outgoing_goods og WHERE og.product_code = p.code AND og.date < ?), 0) +
            COALESCE((SELECT SUM(ig.quantity) FROM incoming_goods ig WHERE ig.product_code = p.code AND ig.date BETWEEN ? AND ?), 0) -
            COALESCE((SELECT SUM(og.quantity) FROM outgoing_goods og WHERE og.product_code = p.code AND og.date BETWEEN ? AND ?), 0)
          ) as calculated_stock
        FROM products p
        ORDER BY p.name
      `, [
        startDate, endDate, // total_incoming
        startDate, endDate, // total_outgoing
        startDate, // stock_at_start incoming before
        startDate, // stock_at_start outgoing before
        startDate, // calculated_stock incoming before
        startDate, // calculated_stock outgoing before
        startDate, endDate, // calculated_stock incoming in period
        startDate, endDate  // calculated_stock outgoing in period
      ])
      data.stockReport = stockReport
    } else if (type === 'incoming') {
      const [incomingReport] = await db.execute(
        'SELECT * FROM incoming_goods WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC',
        [startDate, endDate]
      )
      data.incomingReport = incomingReport
    } else if (type === 'outgoing') {
      const [outgoingReport] = await db.execute(
        'SELECT * FROM outgoing_goods WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC',
        [startDate, endDate]
      )
      data.outgoingReport = outgoingReport
    }
    
    // Log activity
    await logActivity(req.user.id, 'GENERATE_REPORT', `Generated ${type} report for ${startDate} to ${endDate}`)
    
    res.json(data)
  } catch (error) {
    console.error('Reports error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Orders Routes
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { page, limit, offset, search } = getPaginationParams(req)
    const { startDate, endDate } = req.query
    
    let whereClause = ''
    let params = []
    let conditions = []
    
    if (search) {
      conditions.push('(product_name LIKE ? OR product_code LIKE ? OR category LIKE ? OR brand LIKE ? OR resi_number LIKE ? OR bank LIKE ?)')
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }
    
    // Fix date filtering logic
    if (startDate && endDate) {
      conditions.push('DATE(date) BETWEEN ? AND ?')
      params.push(startDate, endDate)
    } else if (startDate) {
      conditions.push('DATE(date) >= ?')
      params.push(startDate)
    } else if (endDate) {
      conditions.push('DATE(date) <= ?')
      params.push(endDate)
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ')
    }
    
    // Get total count
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM orders ${whereClause}`,
      params
    )
    const total = countResult[0].total
    
    // Get paginated data
    const [orders] = await db.execute(
      `SELECT * FROM orders ${whereClause} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    
    res.json({
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get orders error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/orders', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { product_code, product_name, category, brand, quantity, price, resi_number, bank, date } = req.body
    
    const [result] = await db.execute(
      'INSERT INTO orders (product_code, product_name, category, brand, quantity, price, resi_number, bank, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [product_code, product_name, category, brand, quantity, price, resi_number, bank, date]
    )
    
    // Log activity
    await logActivity(req.user.id, 'CREATE_ORDER', `Created order: ${product_name} (${quantity} units)`)
    
    res.status(201).json({ id: result.insertId, message: 'Order added successfully' })
  } catch (error) {
    console.error('Create order error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.put('/api/orders/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    const { product_code, product_name, category, brand, quantity, price, resi_number, bank, date } = req.body
    
    await db.execute(
      'UPDATE orders SET product_code = ?, product_name = ?, category = ?, brand = ?, quantity = ?, price = ?, resi_number = ?, bank = ?, date = ? WHERE id = ?',
      [product_code, product_name, category, brand, quantity, price, resi_number, bank, date, id]
    )
    
    // Log activity
    await logActivity(req.user.id, 'UPDATE_ORDER', `Updated order: ${product_name}`)
    
    res.json({ message: 'Order updated successfully' })
  } catch (error) {
    console.error('Update order error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.delete('/api/orders/:id', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { id } = req.params
    
    // Get order info for logging
    const [order] = await db.execute('SELECT product_name FROM orders WHERE id = ?', [id])
    
    await db.execute('DELETE FROM orders WHERE id = ?', [id])
    
    // Log activity
    if (order.length > 0) {
      await logActivity(req.user.id, 'DELETE_ORDER', `Deleted order: ${order[0].product_name}`)
    }
    
    res.json({ message: 'Order deleted successfully' })
  } catch (error) {
    console.error('Delete order error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Orders Summary Routes
app.get('/api/orders/summary', authenticateToken, async (req, res) => {
  try {
    const { page, limit, offset, search } = getPaginationParams(req)
    const { startDate, endDate } = req.query
    
    let whereClause = ''
    let params = []
    let conditions = []
    
    if (search) {
      conditions.push('(product_name LIKE ? OR product_code LIKE ? OR category LIKE ? OR brand LIKE ?)')
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }
    
    // Fix date filtering logic
    if (startDate && endDate) {
      conditions.push('DATE(date) BETWEEN ? AND ?')
      params.push(startDate, endDate)
    } else if (startDate) {
      conditions.push('DATE(date) >= ?')
      params.push(startDate)
    } else if (endDate) {
      conditions.push('DATE(date) <= ?')
      params.push(endDate)
    }
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ')
    }
    
    // Get summary data grouped by product
    const [summaryData] = await db.execute(`
      SELECT 
        product_code,
        product_name,
        category,
        brand,
        SUM(quantity) as total_quantity,
        COUNT(*) as total_orders,
        SUM(price * quantity) / SUM(quantity) as average_price,
        MIN(date) as first_order_date,
        MAX(date) as last_order_date,
        GROUP_CONCAT(DISTINCT resi_number ORDER BY date DESC SEPARATOR ', ') as resi_numbers
      FROM orders 
      ${whereClause}
      GROUP BY product_code, product_name, category, brand
      ORDER BY total_quantity DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset])
    
    // Get total count of unique products
    const [countResult] = await db.execute(`
      SELECT COUNT(DISTINCT product_code) as total 
      FROM orders 
      ${whereClause}
    `, params)
    const total = countResult[0].total
    
    res.json({
      data: summaryData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get orders summary error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Pembukuan Routes
app.get('/api/pembukuan', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { page, limit, offset, search, startDate, endDate } = getPaginationParams(req)
    
    let whereClause = ''
    let params = []
    
    if (search) {
      whereClause = 'AND (p.name LIKE ? OR p.code LIKE ? OR p.category LIKE ? OR p.brand LIKE ?)'
      params = [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
    }
    
    let dateFilter = ''
    let dateParams = []
    
    if (startDate && endDate) {
      dateFilter = 'AND og.date BETWEEN ? AND ?'
      dateParams = [startDate, endDate]
    }
    
    // Get total count - individual outgoing goods records with resi
    const [countResult] = await db.execute(`
      SELECT COUNT(*) as total 
      FROM outgoing_goods og
      INNER JOIN products p ON og.product_code = p.code
      WHERE og.resi_number IS NOT NULL AND og.resi_number != ''
      ${whereClause}
      ${dateFilter}
    `, [...dateParams, ...params])
    const total = countResult[0].total
    
    // Get paginated data - individual outgoing goods records with their own pricing
    const [pembukuan] = await db.execute(`
      SELECT 
        og.id,
        og.date,
        og.product_code as code,
        og.product_name as name,
        og.category,
        og.brand,
        og.quantity,
        og.resi_number,
        COALESCE(og.purchase_price, 0) as purchase_price,
        COALESCE(og.selling_price, 0) as selling_price,
        COALESCE(og.discount, 0) as discount,
        CASE 
          WHEN og.selling_price > 0 AND og.purchase_price > 0 
          THEN (og.selling_price - og.discount - og.purchase_price) * og.quantity
          ELSE 0 
        END as margin
      FROM outgoing_goods og
      INNER JOIN products p ON og.product_code = p.code
      WHERE og.resi_number IS NOT NULL AND og.resi_number != ''
      ${whereClause}
      ${dateFilter}
      ORDER BY og.date DESC, og.id DESC, og.product_name
      LIMIT ? OFFSET ?
    `, [...dateParams, ...params, limit, offset])
    
    res.json({
      data: pembukuan,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get pembukuan error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Pembukuan Statistics endpoint
app.get('/api/pembukuan/stats', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    
    let dateFilter = ''
    let params = []
    
    if (startDate && endDate) {
      dateFilter = 'AND og.date BETWEEN ? AND ?'
      params = [startDate, endDate]
    }
    
    // Get comprehensive statistics from all data (not just current page)
    const [statsResult] = await db.execute(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN margin > 0 THEN 1 ELSE 0 END) as profitable_transactions,
        SUM(margin) as total_profit,
        AVG(margin) as average_profit,
        SUM(quantity) as total_quantity,
        SUM(purchase_price * quantity) as total_purchase_value,
        SUM(selling_price * quantity) as total_selling_value,
        SUM(discount * quantity) as total_discount_value
      FROM (
        SELECT 
          og.quantity,
          COALESCE(og.purchase_price, 0) as purchase_price,
          COALESCE(og.selling_price, 0) as selling_price,
          COALESCE(og.discount, 0) as discount,
          CASE 
            WHEN og.selling_price > 0 AND og.purchase_price > 0 
            THEN (og.selling_price - og.discount - og.purchase_price) * og.quantity
            ELSE 0 
          END as margin
        FROM outgoing_goods og
        WHERE og.resi_number IS NOT NULL AND og.resi_number != ''
        ${dateFilter}
      ) as pembukuan_data
    `, params)
    
    const stats = statsResult[0]
    
    // Get product-level statistics
    const [productStats] = await db.execute(`
      SELECT 
        og.product_code as code,
        og.product_name as name,
        SUM(CASE 
          WHEN og.selling_price > 0 AND og.purchase_price > 0 
          THEN (og.selling_price - og.discount - og.purchase_price) * og.quantity
          ELSE 0 
        END) as total_profit
      FROM outgoing_goods og
      WHERE og.resi_number IS NOT NULL AND og.resi_number != ''
      ${dateFilter}
      GROUP BY og.product_code, og.product_name
      HAVING total_profit > 0
      ORDER BY total_profit DESC
      LIMIT 6
    `, params)
    
    res.json({
      totalTransactions: stats.total_transactions || 0,
      profitableTransactions: stats.profitable_transactions || 0,
      totalProfit: stats.total_profit || 0,
      averageProfit: stats.average_profit || 0,
      totalQuantity: stats.total_quantity || 0,
      totalPurchaseValue: stats.total_purchase_value || 0,
      totalSellingValue: stats.total_selling_value || 0,
      totalDiscountValue: stats.total_discount_value || 0,
      productProfits: productStats
    })
  } catch (error) {
    console.error('Get pembukuan stats error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/pembukuan', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { outgoing_goods_id, purchase_price, selling_price, discount } = req.body
    
    // Update the specific outgoing goods record with pricing information
    await db.execute(
      'UPDATE outgoing_goods SET purchase_price = ?, selling_price = ?, discount = ? WHERE id = ?',
      [purchase_price, selling_price, discount, outgoing_goods_id]
    )
    
    // Log activity
    await logActivity(req.user.id, 'UPDATE_PEMBUKUAN', `Updated pembukuan for outgoing goods ID: ${outgoing_goods_id}`)
    
    res.json({ message: 'Pembukuan updated successfully' })
  } catch (error) {
    console.error('Update pembukuan error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Activity Logs Routes
app.get('/api/activity-logs', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    const { page, limit, offset, search } = getPaginationParams(req)
    const { action } = req.query
    
    let whereClause = ''
    let params = []
    
    if (search || action) {
      const conditions = []
      if (search) {
        conditions.push('(u.name LIKE ? OR u.email LIKE ? OR al.action LIKE ? OR al.details LIKE ?)')
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
      }
      if (action) {
        conditions.push('al.action = ?')
        params.push(action)
      }
      whereClause = 'WHERE ' + conditions.join(' AND ')
    }
    
    // Get total count
    const [countResult] = await db.execute(`
      SELECT COUNT(*) as total 
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      ${whereClause}
    `, params)
    const total = countResult[0].total
    
    // Get paginated data
    const [logs] = await db.execute(`
      SELECT 
        al.*,
        u.name as user_name,
        u.email as user_email
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY al.timestamp DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset])
    
    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get activity logs error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Barcode generation logging
app.post('/api/barcode/generate', authenticateToken, async (req, res) => {
  try {
    const { product_code } = req.body
    
    // Log activity
    await logActivity(req.user.id, 'GENERATE_BARCODE', `Generated barcode for product: ${product_code}`)
    
    res.json({ message: 'Barcode generation logged' })
  } catch (error) {
    console.error('Barcode generation log error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Eye of Sumatra API is running" });
});

// Utility endpoint to recalculate stock (for fixing data inconsistencies)
app.post('/api/utils/recalculate-stock', authenticateToken, requireRole(['manager']), async (req, res) => {
  try {
    // Recalculate current_stock for all products
    await db.execute(`
      UPDATE products p 
      SET current_stock = (
          p.initial_stock + 
          COALESCE((SELECT SUM(quantity) FROM incoming_goods WHERE product_code = p.code), 0) - 
          COALESCE((SELECT SUM(quantity) FROM outgoing_goods WHERE product_code = p.code), 0)
      )
    `)
    
    // Log activity
    await logActivity(req.user.id, 'RECALCULATE_STOCK', 'Recalculated stock for all products')
    
    res.json({ message: 'Stock recalculated successfully' })
  } catch (error) {
    console.error('Recalculate stock error:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

// Start server
// const startServer = async () => {
//   await connectDB()
//   app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`)
//   })
// }
// const startServer = async () => {
//   await connectDB()
//   app.listen()
// }

// startServer()

app.listen(5000, () => {
  console.log("Server is running on port 5000")
})