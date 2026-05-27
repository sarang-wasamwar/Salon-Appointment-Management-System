const Razorpay = require("razorpay");
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const transporter = require('./email');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const fs = require('fs');
const { generateReceipt } = require('./utils/receipt');
require('dotenv').config();

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin:true,
    credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, 'public');
console.log('Serving static files from:', publicPath);
app.use(express.static(publicPath));

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const dbConfig = {
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "salonsnap",
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let db;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 2000;

function createDatabaseConnection() {
    console.log('Attempting to connect to database with config:', {
        host: dbConfig.host,
        database: dbConfig.database,
        user: dbConfig.user,
        port: dbConfig.port
    });

    db = mysql.createConnection(dbConfig);
    
    db.connect((err) => {
        if (err) {
            console.error('Database connection failed:', err);
            handleDisconnect();
            return;
        }
        console.log('Connected to MySQL database successfully!');
        console.log('   Host:', dbConfig.host);
        console.log('   Port:', dbConfig.port);
        reconnectAttempts = 0;
    });

    db.on('error', (err) => {
        console.error('Database error:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || 
            err.code === 'ECONNRESET' || 
            err.code === 'ETIMEDOUT' ||
            err.fatal) {
            console.log('Connection lost. Attempting to reconnect...');
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

function handleDisconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts.`);
        return;
    }

    reconnectAttempts++;
    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
    console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);
    
    setTimeout(() => {
        console.log('Attempting to reconnect to database...');
        createDatabaseConnection();
    }, delay);
}

createDatabaseConnection();

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });    
}

function authenticateAdminToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role !== 'admin') return res.sendStatus(403);
        req.user = user;
        next();
    });
}

app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working!' });
});

app.get('/api/test-db', (req, res) => {
    if (!db) {
        return res.status(500).json({ error: 'Database not initialized' });
    }
    db.query('SELECT 1 + 1 AS solution', (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json({ message: 'Database connected successfully' });
    });
});

app.post('/api/auth/login', (req, res) => {
    console.log('🔑 Login attempt - Body:', req.body);
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    db.query('SELECT * FROM Customers WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const customer = results[0];
        
        if (!customer.password_hash) {
            return res.status(401).json({ error: 'This email is not registered. Please sign up first.' });
        }

        try {
            const match = await bcrypt.compare(password, customer.password_hash);
            if (!match) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            const token = jwt.sign(
                { customer_id: customer.customer_id, email: customer.email },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            res.json({ token, customer_id: customer.customer_id });
        } catch (compareError) {
            console.error('Password comparison error:', compareError);
            res.status(500).json({ error: 'Login failed' });
        }
    });
});

app.post('/api/auth/signup', async (req, res) => {
    console.log('📝 Signup attempt:', { ...req.body, password: '[HIDDEN]' });
    const { full_name, email, phone, password } = req.body;
    if (!full_name || !email || !phone || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }    

    db.query('SELECT * FROM Customers WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        if (results.length > 0) {
            const customer = results[0];
            if (customer.password_hash) {
                return res.status(409).json({ error: 'Email already registered' });
            } else {
                const hash = await bcrypt.hash(password, 10);
                db.query(
                    'UPDATE Customers SET full_name = ?, phone = ?, password_hash = ? WHERE customer_id = ?',
                    [full_name, phone, hash, customer.customer_id],
                    (err2) => {
                        if (err2) return res.status(500).json({ error: 'Update failed' });
                        const token = jwt.sign(
                            { customer_id: customer.customer_id, email: customer.email },
                            JWT_SECRET,
                            { expiresIn: '7d' }
                        );    
                        res.json({ token, customer_id: customer.customer_id });
                    }    
                );    
            }    
        } else {
            const hash = await bcrypt.hash(password, 10);
            db.query(
                'INSERT INTO Customers (full_name, phone, email, password_hash) VALUES (?, ?, ?, ?)',
                [full_name, phone, email, hash],
                (err2, result) => {
                    if (err2) {
                        if (err2.code === 'ER_DUP_ENTRY') {
                            return res.status(409).json({ error: 'Phone or email already exists' });
                        }    
                        return res.status(500).json({ error: 'Insert failed' });
                    }    
                    const token = jwt.sign(
                        { customer_id: result.insertId, email },
                        JWT_SECRET,
                        { expiresIn: '7d' }
                    );    
                    res.json({ token, customer_id: result.insertId });
                }    
            );    
        }    
    });    
});    

app.post("/api/auth/verify", (req, res) => {
    const { email, phone } = req.body;

    if (!email && !phone) {
        return res.status(400).json({ error: "Email or phone required" });
    }

    const findQuery = `
        SELECT customer_id 
        FROM Customers 
        WHERE email = ? OR phone = ?
        LIMIT 1
    `;

    db.query(findQuery, [email, phone], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Database error" });
        }

        if (results.length > 0) {
            return res.json({
                customer_id: results[0].customer_id,
                status: "existing"
            });
        }

        return res.status(404).json({ error: "Customer not found", status: "not_found" });
    });
});

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error serving index.html:', err);
            res.status(500).send('Error loading the page.');
        }
    });
});

app.get('/health', (req, res) => {
    const fs = require('fs');
    const publicDir = path.join(__dirname, 'public');
    const files = fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : ['public directory not found'];
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        directory: __dirname,
        publicPath: publicDir,
        files: files,
        database: 'Connected to: ' + process.env.DB_NAME
    });
});

app.get('/api/user/appointments', authenticateToken, (req, res) => {
    const customer_id = req.user.customer_id;
    const query = `
        SELECT
            a.appointment_id,
            a.appointment_date,
            a.appointment_time,
            a.status,
            a.notes,
            s.service_name,
            s.price,
            st.full_name as staff_name
        FROM Appointments a    
        JOIN Services s ON a.service_id = s.service_id
        LEFT JOIN Staff st ON a.staff_id = st.staff_id
        WHERE a.customer_id = ?
        ORDER BY a.appointment_date DESC, a.appointment_time DESC
    `;    
    db.query(query, [customer_id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch appointments' });
        res.json(results);
    });    
});    


app.get('/api/services', (req, res) => {
    const query = 'SELECT * FROM Services WHERE is_premium = FALSE OR is_premium IS NULL ORDER BY service_name';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching services:', err);
            res.status(500).json({ error: 'Failed to fetch services' });
            return;
        }
        res.json(results);
    });
});

app.get('/api/premium', (req, res) => {
    const query = 'SELECT * FROM Services WHERE is_premium = TRUE ORDER BY service_name';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching premium services:', err);
            res.status(500).json({ error: 'Failed to fetch premium services' });
            return;
        }
        console.log(`Fetched ${results.length} premium services from database`);
        res.json(results);
    });
});

app.get('/api/all-services', (req, res) => {
    const query = 'SELECT * FROM Services ORDER BY is_premium DESC, service_name';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching all services:', err);
            res.status(500).json({ error: 'Failed to fetch all services' });
            return;
        }
        res.json(results);
    });
});

app.get('/api/services-with-images', (req, res) => {
    console.log("📸 Fetching services with images...");
    const query = `
        SELECT s.*, 
               GROUP_CONCAT(si.image_url ORDER BY si.display_order) as images
        FROM Services s
        LEFT JOIN ServiceImages si ON s.service_id = si.service_id
        GROUP BY s.service_id
        ORDER BY s.is_premium DESC, s.service_name
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error fetching services with images:', err);
            return res.status(500).json({ error: 'Failed to fetch services' });
        }
        
        const services = results.map(service => ({
            ...service,
            images: service.images ? service.images.split(',') : []
        }));
        
        console.log(`✅ Fetched ${services.length} services with images`);
        res.json(services);
    });
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'service-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

app.post('/api/services/:id/upload-image', authenticateAdminToken, upload.single('image'), (req, res) => {
    const serviceId = req.params.id;
    
    if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }
    
    const countQuery = 'SELECT COUNT(*) as count FROM ServiceImages WHERE service_id = ?';
    db.query(countQuery, [serviceId], (err, countResults) => {
        if (err) {
            console.error('Error checking image count:', err);
            return res.status(500).json({ error: 'Failed to check images' });
        }
        
        if (countResults[0].count >= 3) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Maximum 3 images allowed per service' });
        }
        
        const imageUrl = `/uploads/${req.file.filename}`;
        const insertQuery = 'INSERT INTO ServiceImages (service_id, image_url, display_order) VALUES (?, ?, ?)';
        
        db.query(insertQuery, [serviceId, imageUrl, countResults[0].count], (err, result) => {
            if (err) {
                console.error('Error adding image:', err);
                fs.unlinkSync(req.file.path);
                return res.status(500).json({ error: 'Failed to add image' });
            }
            res.json({ 
                message: 'Image uploaded successfully', 
                image_id: result.insertId,
                image_url: imageUrl
            });
        });
    });
});


app.get('/api/services/:id/images', (req, res) => {
    const serviceId = req.params.id;
    const query = 'SELECT * FROM ServiceImages WHERE service_id = ? ORDER BY display_order ASC';
    
    db.query(query, [serviceId], (err, results) => {
        if (err) {
            console.error('Error fetching service images:', err);
            return res.status(500).json({ error: 'Failed to fetch images' });
        }
        res.json(results);
    });
});

app.post('/api/services/:id/images', authenticateAdminToken, (req, res) => {
    const serviceId = req.params.id;
    const { image_url, display_order } = req.body;
    
    if (!image_url) {
        return res.status(400).json({ error: 'Image URL is required' });
    }
    
    const countQuery = 'SELECT COUNT(*) as count FROM ServiceImages WHERE service_id = ?';
    db.query(countQuery, [serviceId], (err, countResults) => {
        if (err) {
            console.error('Error checking image count:', err);
            return res.status(500).json({ error: 'Failed to check images' });
        }
        
        if (countResults[0].count >= 3) {
            return res.status(400).json({ error: 'Maximum 3 images allowed per service' });
        }
        
        const insertQuery = 'INSERT INTO ServiceImages (service_id, image_url, display_order) VALUES (?, ?, ?)';
        const order = display_order !== undefined ? display_order : countResults[0].count;
        
        db.query(insertQuery, [serviceId, image_url, order], (err, result) => {
            if (err) {
                console.error('Error adding image:', err);
                return res.status(500).json({ error: 'Failed to add image' });
            }
            res.json({ 
                message: 'Image added successfully', 
                image_id: result.insertId 
            });
        });
    });
});

app.delete('/api/services/images/:image_id', authenticateAdminToken, (req, res) => {
    const imageId = req.params.image_id;
    
    const query = 'DELETE FROM ServiceImages WHERE image_id = ?';
    db.query(query, [imageId], (err, result) => {
        if (err) {
            console.error('Error deleting image:', err);
            return res.status(500).json({ error: 'Failed to delete image' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Image not found' });
        }
        res.json({ message: 'Image deleted successfully' });
    });
});

app.post('/api/services', authenticateAdminToken, (req, res) => {
    const { service_name, description, price, duration_minutes, is_premium } = req.body;
    
    if (!service_name || !price || !duration_minutes) {
        res.status(400).json({ error: 'Service name, price, and duration are required' });
        return;
    }
    
    const premiumValue = is_premium ? 1 : 0;
    const serviceDescription = description && description.trim() ? description.trim() : null;
    
    const query = 'INSERT INTO Services (service_name, description, price, duration_minutes, is_premium) VALUES (?, ?, ?, ?, ?)';
    
    db.query(query, [service_name, serviceDescription, parseFloat(price), parseInt(duration_minutes), premiumValue], (err, result) => {
        if (err) {
            console.error('Error creating service:', err);
            res.status(500).json({ error: 'Failed to create service' });
            return;
        }
        
        res.status(201).json({ 
            message: 'Service created successfully', 
            serviceId: result.insertId 
        });
    });
});

app.put('/api/services/:id', authenticateAdminToken, (req, res) => {
    const serviceId = req.params.id;
    const { service_name, description, price, duration_minutes, is_premium } = req.body;
    
    if (!service_name || !price || !duration_minutes) {
        res.status(400).json({ error: 'Service name, price, and duration are required' });
        return;
    }
    
    const premiumValue = is_premium ? 1 : 0;
    const serviceDescription = description && description.trim() ? description.trim() : null;
    
    const query = 'UPDATE Services SET service_name = ?, description = ?, price = ?, duration_minutes = ?, is_premium = ? WHERE service_id = ?';
    
    db.query(query, [service_name, serviceDescription, parseFloat(price), parseInt(duration_minutes), premiumValue, serviceId], (err, result) => {
        if (err) {
            console.error('Error updating service:', err);
            res.status(500).json({ error: 'Failed to update service' });
            return;
        }
        
        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Service not found' });
            return;
        }
        
        res.json({ message: 'Service updated successfully' });
    });
});

app.delete('/api/services/:id', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM Services WHERE service_id = ?', [id], (err, result) => {
        if (err) {
            console.error('Error deleting service:', err);
            res.status(500).json({ error: 'Failed to delete service' });
            return;
        }
        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Service not found' });
            return;
        }
        res.json({ message: 'Service deleted' });
    });
});

app.get('/api/staff', (req, res) => {
    const query = 'SELECT staff_id, full_name, role, phone, email, salary FROM Staff ORDER BY full_name';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching staff:', err);
            res.status(500).json({ error: 'Failed to fetch staff' });
            return;
        }
        res.json(results);
    });
});

app.post('/api/staff', authenticateAdminToken, (req, res) => {
    const { full_name, role, phone, email, salary } = req.body;
    if (!full_name || !role || !phone || !email) {
        res.status(400).json({ error: 'full_name, role, phone, and email are required' });
        return;
    }
    const s = salary !== undefined ? parseFloat(salary) : 0;
    const q = 'INSERT INTO Staff (full_name, role, phone, email, hire_date, salary) VALUES (?, ?, ?, ?, CURDATE(), ?)';
    db.query(q, [full_name.trim(), role.trim(), phone.trim(), email.trim(), s], (err, result) => {
        if (err) {
            console.error('Error creating staff:', err);
            if (err.code === 'ER_DUP_ENTRY') {
                res.status(409).json({ error: 'Phone or email already exists' });
            } else {
                res.status(500).json({ error: 'Failed to create staff' });
            }
            return;
        }
        res.json({ message: 'Staff created', staff_id: result.insertId });
    });
});

app.put('/api/staff/:id', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    const { full_name, role, phone, email, salary } = req.body;
    if (!full_name || !role || !phone || !email) {
        res.status(400).json({ error: 'full_name, role, phone, and email are required' });
        return;
    }
    const s = salary !== undefined ? parseFloat(salary) : 0;
    const q = 'UPDATE Staff SET full_name = ?, role = ?, phone = ?, email = ?, salary = ? WHERE staff_id = ?';
    db.query(q, [full_name.trim(), role.trim(), phone.trim(), email.trim(), s, id], (err, result) => {
        if (err) {
            console.error('Error updating staff:', err);
            res.status(500).json({ error: 'Failed to update staff' });
            return;
        }
        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Staff not found' });
            return;
        }
        res.json({ message: 'Staff updated' });
    });
});

app.delete('/api/staff/:id', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM Staff WHERE staff_id = ?', [id], (err, result) => {
        if (err) {
            console.error('Error deleting staff:', err);
            res.status(500).json({ error: 'Failed to delete staff' });
            return;
        }
        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Staff not found' });
            return;
        }
        res.json({ message: 'Staff deleted' });
    });
});

app.get('/api/customers', authenticateAdminToken, (req, res) => {
    const query = 'SELECT * FROM Customers ORDER BY full_name';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching customers:', err);
            res.status(500).json({ error: 'Failed to fetch customers' });
            return;
        }
        res.json(results);
    });
});

app.get('/api/appointments', authenticateAdminToken, (req, res) => {
    const query = `
         SELECT 
            a.appointment_id,
            a.appointment_date,
            a.appointment_time,
            a.status,
            a.notes,
            c.full_name as customer_name,
            c.phone as customer_phone,
            s.full_name as staff_name,
            sv.service_name,
            sv.price,
            sv.duration_minutes,
            p.payment_id,
            p.payment_method,
            p.payment_status,
            p.receipt_url
        FROM Appointments a
        JOIN Customers c ON a.customer_id = c.customer_id
        LEFT JOIN Staff s ON a.staff_id = s.staff_id
        JOIN Services sv ON a.service_id = sv.service_id
        LEFT JOIN Payments p ON a.appointment_id = p.appointment_id
        ORDER BY a.appointment_date DESC, a.appointment_time DESC
    `;
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching appointments:', err);
            res.status(500).json({ error: 'Failed to fetch appointments' });
            return;
        }
        res.json(results);
    });
});

app.post('/api/customers', (req, res) => {
    let { full_name, phone, email } = req.body;

    if (!full_name || !phone || !email) {
        res.status(400).json({ error: 'full_name, phone and email are required' });
        return;
    }

    full_name = full_name.trim();
    phone = phone.trim();
    email = email.trim().toLowerCase();

    const findQuery = 'SELECT customer_id FROM Customers WHERE phone = ? OR email = ? LIMIT 1';
    db.query(findQuery, [phone, email], (findErr, findResults) => {
        if (findErr) {
            console.error('Error checking existing customer:', findErr);
            res.status(500).json({ error: 'Failed to check existing customer' });
            return;
        }

        if (findResults.length > 0) {
            const existingId = findResults[0].customer_id;
            res.json({ message: 'Customer reused', customer_id: existingId, reused: true });
            return;
        }

        const insertQuery = 'INSERT INTO Customers (full_name, phone, email) VALUES (?, ?, ?)';
        db.query(insertQuery, [full_name, phone, email], (insertErr, insertResults) => {
            if (insertErr) {
                console.error('Error creating customer:', insertErr);
                if (insertErr.code === 'ER_DUP_ENTRY') {
                    res.status(409).json({ error: 'Customer with same phone or email already exists' });
                } else {
                    res.status(500).json({ error: 'Failed to create customer' });
                }
                return;
            }
            res.json({ 
                message: 'Customer created successfully', 
                customer_id: insertResults.insertId,
                reused: false
            });
        });
    });
});

app.post('/api/appointments', authenticateToken, (req, res) => {
    let { customer_id, staff_id, service_id, appointment_date, appointment_time, notes, payment_method } = req.body;

    console.log('Incoming appointment payload:', req.body);

    if (req.user.role !== 'admin') {
        if (customer_id && parseInt(customer_id, 10) !== req.user.customer_id) {
            return res.status(403).json({ error: 'Not authorized to book for another customer' });
        }
        customer_id = req.user.customer_id;
    }

    if (!customer_id || !service_id || !appointment_date || !appointment_time) {
        return res.status(400).json({ error: 'customer_id, service_id, appointment_date, appointment_time are required' });
    }

    customer_id = parseInt(customer_id, 10);
    service_id = parseInt(service_id, 10);
    if (staff_id === '' || staff_id === undefined || staff_id === null) {
        staff_id = null;
    } else {
        staff_id = parseInt(staff_id, 10);
        if (isNaN(staff_id)) staff_id = null;
    }

    if ([customer_id, service_id].some(isNaN)) {
        return res.status(400).json({ error: 'customer_id and service_id must be valid integers' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) {
        return res.status(400).json({ error: 'appointment_date must be in YYYY-MM-DD format' });
    }

    if (/^\d{2}:\d{2}$/.test(appointment_time)) {
        appointment_time = appointment_time + ':00';
    }
    if (!/^\d{2}:\d{2}:\d{2}$/.test(appointment_time)) {
        return res.status(400).json({ error: 'appointment_time must be in HH:MM or HH:MM:SS format' });
    }

    const appointmentNotes = notes && notes.trim() ? notes.trim() : null;

    const appointmentQuery = 'INSERT INTO Appointments (customer_id, staff_id, service_id, appointment_date, appointment_time, notes) VALUES (?, ?, ?, ?, ?, ?)';
    
    const proceedInsert = (finalStaffId) => {
        db.query(appointmentQuery, [customer_id, finalStaffId, service_id, appointment_date, appointment_time, appointmentNotes], (err, results) => {
            if (err) {
                console.error('Error creating appointment:', err);
                if (err.code === 'ER_NO_REFERENCED_ROW_2') {
                    return res.status(400).json({ error: 'Invalid foreign key: ensure customer_id, staff_id (if provided), and service_id exist', detail: err.code });
                } else if (err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
                    return res.status(400).json({ error: 'Invalid value format (likely time/date)', detail: err.code });
                } else {
                    return res.status(500).json({ error: 'Failed to create appointment', detail: err.code });
                }
            }
            
            const appointment_id = results.insertId;
            console.log('Appointment created with ID:', results.insertId, 'staff:', finalStaffId);

            db.query(`
                SELECT s.*, st.full_name as staff_name 
                FROM Services s
                LEFT JOIN Staff st ON st.staff_id = ?
                WHERE s.service_id = ?
            `, [finalStaffId, service_id], (detailsErr, detailsResults) => {
                if (detailsErr || !detailsResults.length) {
                    console.error('Error fetching service details:', detailsErr);
                    return res.json({ 
                        message: 'Appointment created successfully', 
                        appointment_id: appointment_id,
                        staff_assigned: finalStaffId,
                        auto_assigned: staff_id === null,
                        payment_method: payment_method || null
                    });
                }

                const service = detailsResults[0];
                const amount = service.price;
                const serviceName = service.service_name;
                const servicePrice = service.price;
                const serviceDuration = service.duration_minutes;
                const staffName = service.staff_name || null;

                const paymentQuery = `
                    INSERT INTO Payments (
                        appointment_id, customer_id, amount, payment_method, payment_status,
                        service_name, service_price, service_duration,
                        appointment_date, appointment_time, staff_name
                    ) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?)
                `;
                
                db.query(paymentQuery, [
                    appointment_id, customer_id, amount, payment_method,
                    serviceName, servicePrice, serviceDuration,
                    appointment_date, appointment_time, staffName
                ], (paymentErr, paymentResult) => {
                    if (paymentErr) {
                        console.error('Error creating payment record:', paymentErr);
                    } else {
                        console.log('✅ Payment record created with ID:', paymentResult.insertId);
                    }

                    res.json({ 
                        message: 'Appointment created successfully', 
                        appointment_id: appointment_id,
                        payment_id: paymentResult ? paymentResult.insertId : null,
                        payment_method: payment_method || 'Cash',
                        staff_assigned: finalStaffId,
                        auto_assigned: staff_id === null
                    });
                });
            });
        });
    };

    db.query('SELECT duration_minutes FROM Services WHERE service_id = ?', [service_id], (durErr, durResults) => {
        if (durErr || !durResults.length) {
            console.error('Error fetching service duration:', durErr);
            return res.status(500).json({ error: 'Failed to fetch service details' });
        }

        const requestedDuration = durResults[0].duration_minutes;
        const [reqHour, reqMin] = appointment_time.split(':').map(Number);
        const requestedTimeMinutes = reqHour * 60 + reqMin;
        const requestedEndMinutes = requestedTimeMinutes + requestedDuration;

        if (staff_id === null) {
            const detailedQuery = `
                SELECT a.staff_id, a.appointment_time, s.duration_minutes
                FROM Appointments a
                JOIN Services s ON a.service_id = s.service_id
                WHERE a.appointment_date = ?
                  AND a.status = 'Scheduled'
                  AND a.staff_id IS NOT NULL
            `;
            db.query(detailedQuery, [appointment_date], (detailErr, appointments) => {
                if (detailErr) {
                    console.error('Error fetching appointment details:', detailErr);
                    return res.status(500).json({ error: 'Failed to auto-assign staff' });
                }

                const isStaffBusyAtTime = (staffId) => {
                    const staffAppts = appointments.filter(a => a.staff_id === staffId);
                    for (const apt of staffAppts) {
                        const [aptHour, aptMin] = apt.appointment_time.split(':').map(Number);
                        const aptStartMinutes = aptHour * 60 + aptMin;
                        const aptEndMinutes = aptStartMinutes + apt.duration_minutes;
                        
                        if (
                            (requestedTimeMinutes >= aptStartMinutes && requestedTimeMinutes < aptEndMinutes) ||
                            (requestedEndMinutes > aptStartMinutes && requestedEndMinutes <= aptEndMinutes) ||
                            (requestedTimeMinutes <= aptStartMinutes && requestedEndMinutes >= aptEndMinutes)
                        ) {
                            return true;
                        }
                    }
                    return false;
                };

                db.query('SELECT staff_id FROM Staff ORDER BY staff_id', [], (staffErr, allStaff) => {
                    if (staffErr) {
                        console.error('Error fetching staff:', staffErr);
                        return res.status(500).json({ error: 'Failed to auto-assign staff' });
                    }

                    const availableStaff = allStaff.filter(s => !isStaffBusyAtTime(s.staff_id));
                    
                    if (!availableStaff.length) {
                        return res.status(409).json({ error: 'No staff available at that time' });
                    }

                    const assignedId = availableStaff[0].staff_id;
                    console.log('Auto-assigned staff_id:', assignedId);
                    proceedInsert(assignedId);
                });
            });
        } else {
            const staffApptsQuery = `
                SELECT a.appointment_time, s.duration_minutes
                FROM Appointments a
                JOIN Services s ON a.service_id = s.service_id
                WHERE a.appointment_date = ?
                  AND a.staff_id = ?
                  AND a.status = 'Scheduled'
            `;
            db.query(staffApptsQuery, [appointment_date, staff_id], (confErr, staffAppts) => {
                if (confErr) {
                    console.error('Error checking staff conflicts:', confErr);
                    return res.status(500).json({ error: 'Failed to verify staff availability' });
                }

                for (const apt of staffAppts) {
                    const [aptHour, aptMin] = apt.appointment_time.split(':').map(Number);
                    const aptStartMinutes = aptHour * 60 + aptMin;
                    const aptEndMinutes = aptStartMinutes + apt.duration_minutes;

                    if (
                        (requestedTimeMinutes >= aptStartMinutes && requestedTimeMinutes < aptEndMinutes) ||
                        (requestedEndMinutes > aptStartMinutes && requestedEndMinutes <= aptEndMinutes) ||
                        (requestedTimeMinutes <= aptStartMinutes && requestedEndMinutes >= aptEndMinutes)
                    ) {
                        return res.status(409).json({ error: 'Selected staff is already booked during that time' });
                    }
                }

                proceedInsert(staff_id);
            });
        }
    });
});

app.put('/api/appointments/:id/status', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const query = 'UPDATE Appointments SET status = ? WHERE appointment_id = ?';
    
    db.query(query, [status, id], (err, results) => {
        if (err) {
            console.error('Error updating appointment:', err);
            res.status(500).json({ error: 'Failed to update appointment' });
            return;
        }
        if (results.affectedRows === 0) {
            res.status(404).json({ error: 'Appointment not found' });
            return;
        }
        res.json({ message: 'Appointment status updated successfully' });
    });
});

app.put('/api/appointments/:id/staff', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    const { staff_id } = req.body;
    const query = 'UPDATE Appointments SET staff_id = ? WHERE appointment_id = ?';
    
    db.query(query, [staff_id, id], (err, results) => {
        if (err) {
            console.error('Error updating appointment staff:', err);
            res.status(500).json({ error: 'Failed to update staff assignment' });
            return;
        }
        if (results.affectedRows === 0) {
            res.status(404).json({ error: 'Appointment not found' });
            return;
        }
        res.json({ message: 'Staff assignment updated successfully' });
    });
});

app.get('/api/available-slots', (req, res) => {
    const { date, staff_id } = req.query;
    
    if (!date) {
        res.status(400).json({ error: 'Date is required' });
        return;
    }
    
    let query = `
        SELECT appointment_time 
        FROM Appointments 
        WHERE appointment_date = ? AND status = 'Scheduled'
    `;
    
    let params = [date];
    
    if (staff_id) {
        query += ' AND staff_id = ?';
        params.push(staff_id);
    }
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error fetching booked slots:', err);
            res.status(500).json({ error: 'Failed to fetch available slots' });
            return;
        }
        
        const allSlots = [];
        for (let hour = 9; hour <= 18; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                if (hour === 18 && minute > 0) break;
                const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
                allSlots.push(timeSlot);
            }
        }
        
        const bookedTimes = results.map(row => row.appointment_time);
        const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));
        
        res.json(availableSlots);
    });
});

app.get('/api/available-staff', (req, res) => {
    let { date, time, service_id } = req.query;

    if (!date || !time) {
        res.status(400).json({ error: 'date and time query params are required' });
        return;
    }

    if (/^\d{2}:\d{2}$/.test(time)) time = time + ':00';
    if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) {
        res.status(400).json({ error: 'time must be in HH:MM or HH:MM:SS format' });
        return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
        return;
    }

    const getServiceDuration = (callback) => {
        if (!service_id) {
            callback(null, 60); 
            return;
        }
        db.query('SELECT duration_minutes FROM Services WHERE service_id = ?', [service_id], (err, results) => {
            if (err || !results.length) {
                callback(null, 60); 
            } else {
                callback(null, results[0].duration_minutes);
            }
        });
    };

    getServiceDuration((err, requestedDuration) => {
        const appointmentsQuery = `
            SELECT 
                a.staff_id,
                a.appointment_time,
                s.duration_minutes
            FROM Appointments a
            JOIN Services s ON a.service_id = s.service_id
            WHERE a.appointment_date = ?
              AND a.status = 'Scheduled'
              AND a.staff_id IS NOT NULL
        `;
        
        db.query(appointmentsQuery, [date], (appErr, appointments) => {
            if (appErr) {
                console.error('Error fetching appointments:', appErr);
                res.status(500).json({ error: 'Database error' });
                return;
            }
            const [reqHour, reqMin] = time.split(':').map(Number);
            const requestedTimeMinutes = reqHour * 60 + reqMin;
            const requestedEndMinutes = requestedTimeMinutes + requestedDuration;

            const isStaffBusy = (staffId) => {
                const staffAppointments = appointments.filter(a => a.staff_id === staffId);
                
                for (const apt of staffAppointments) {
                    const [aptHour, aptMin] = apt.appointment_time.split(':').map(Number);
                    const aptStartMinutes = aptHour * 60 + aptMin;
                    const aptEndMinutes = aptStartMinutes + apt.duration_minutes;

                    if (
                        (requestedTimeMinutes >= aptStartMinutes && requestedTimeMinutes < aptEndMinutes) ||
                        (requestedEndMinutes > aptStartMinutes && requestedEndMinutes <= aptEndMinutes) ||
                        (requestedTimeMinutes <= aptStartMinutes && requestedEndMinutes >= aptEndMinutes)
                    ) {
                        return true;
                    }
                }
                return false;
            };

            const staffQuery = 'SELECT staff_id, full_name, role FROM Staff ORDER BY full_name';
            db.query(staffQuery, [], (staffErr, allStaff) => {
                if (staffErr) {
                    console.error('Error fetching staff:', staffErr);
                    res.status(500).json({ error: 'Database error' });
                    return;
                }

                const availableStaff = allStaff.filter(staff => !isStaffBusy(staff.staff_id));
                res.json({
                    date,
                    time,
                    service_duration: requestedDuration,
                    available_count: availableStaff.length,
                    staff: availableStaff
                });
            });
        });
    });
});

app.get('/api/messages', authenticateAdminToken, (req, res) => {
    const q = 'SELECT message_id, name, email, subject, message, created_at FROM Messages ORDER BY created_at DESC';
    db.query(q, (err, results) => {
        if (err) {
            console.error('Error fetching messages:', err);
            return res.status(500).json({ error: 'Failed to fetch messages' });
        }
        console.log(`📬 Fetched ${results.length} messages`);
        res.json(results);
    });
});

app.post('/api/messages', (req, res) => {
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'name, email and message are required' });
    }
    
    console.log('New message received:', { name, email, subject });
    
    const q = 'INSERT INTO Messages (name, email, subject, message) VALUES (?, ?, ?, ?)';
    db.query(q, [name.trim(), email.trim().toLowerCase(), subject || null, message.trim()], (err, result) => {
        if (err) {
            console.error('Error saving message:', err);
            return res.status(500).json({ error: 'Failed to save message' });
        }
        
        console.log('Message saved to database, ID:', result.insertId);
        
        const adminEmail = process.env.EMAIL_USER;
        
        if (adminEmail) {
            const emailSubject = subject ? `📬 New Contact Form: ${subject}` : '📬 New Contact Form Message';
            const emailContent = `
You have received a new message from the contact form:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝CONTACT FORM DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name: ${name}
Email: ${email}
Subject: ${subject || 'No Subject'}

Message:
${message}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Sent from: SalonSnap Website Contact Form
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            `;
            
            transporter.sendMail({
                from: `"${name}" <${email}>`,
                to: adminEmail,
                replyTo: email,
                subject: emailSubject,
                text: emailContent
            }, (mailErr) => {
                if (mailErr) {
                    console.error(' Email notification error:', mailErr.message);
                } else {
                    console.log(' Email notification sent to admin:', adminEmail);
                }
            });
        } else {
            console.warn(' EMAIL_USER not configured, skipping email notification');
        }
        
        res.json({ 
            message: 'Message saved successfully', 
            message_id: result.insertId 
        });
    });
});

app.delete('/api/messages/:id', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    const q = 'DELETE FROM Messages WHERE message_id = ?';
    db.query(q, [id], (err, result) => {
        if (err) {
            console.error('Error deleting message:', err);
            return res.status(500).json({ error: 'Failed to delete message' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Message not found' });
        }
        res.json({ message: 'Message deleted successfully' });
    });
});


app.get('/api/admin/stats', authenticateAdminToken, (req, res) => {
    const qAppointments = `
        SELECT 
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'Scheduled' THEN 1 ELSE 0 END) AS scheduled,
            SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled
        FROM Appointments
    `;
    db.query(qAppointments, (err, rows) => {
        if (err) {
            console.error('Error computing appointment stats:', err);
            res.status(500).json({ error: 'Failed to compute stats' });
            return;
        }
        const stats = rows[0] || { total: 0, scheduled: 0, completed: 0, cancelled: 0 };
        
        db.query('SELECT COUNT(*) AS customers FROM Customers', (cErr, cRows) => {
            if (cErr) {
                console.error('Error counting customers:', cErr);
                res.status(500).json({ error: 'Failed to compute stats' });
                return;
            }
            stats.customers = cRows[0]?.customers || 0;
            
            db.query('SELECT COUNT(*) AS messages FROM Messages', (mErr, mRows) => {
                if (mErr) {
                    console.error('Error counting messages:', mErr);
                    res.status(500).json({ error: 'Failed to compute stats' });
                    return;
                }
                stats.messages = mRows[0]?.messages || 0;
                
                db.query(`
                    SELECT SUM(sv.price) AS revenue 
                    FROM Appointments a 
                    JOIN Services sv ON a.service_id = sv.service_id 
                    WHERE a.status = 'Completed'
                `, (rErr, rRows) => {
                    if (rErr) {
                        console.error('Error calculating revenue:', rErr);
                        stats.revenue = 0;
                    } else {
                        stats.revenue = rRows[0]?.revenue || 0;
                    }
                    res.json(stats);
                });
            });
        });
    });
});

app.get('/api/admins', authenticateAdminToken, (req, res) => {
    const q = 'SELECT admin_id, username, created_at FROM Admins ORDER BY created_at DESC';
    db.query(q, (err, rows) => {
        if (err) {
            console.error('Error fetching admins:', err);
            res.status(500).json({ error: 'Failed to fetch admins' });
            return;
        }
        res.json(rows);
    });
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'username and password are required' });
        return;
    }
    const q = 'SELECT admin_id, username, password_hash, salon_id FROM Admins WHERE username = ? LIMIT 1';
    db.query(q, [username], (err, rows) => {
        if (err) {
            console.error('Error during admin lookup:', err);
            res.status(500).json({ error: 'Login failed' });
            return;
        }
        if (!rows.length) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const admin = rows[0];
        bcrypt.compare(password, admin.password_hash, (err, isMatch) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                res.status(500).json({ error: 'Login failed' });
                return;
            }
            if (!isMatch) {
                res.status(401).json({ error: 'Invalid credentials' });
                return;
            }
            const token = jwt.sign(
                { admin_id: admin.admin_id, username: admin.username, role: 'admin' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            res.json({ message: 'Login successful', token, admin: { admin_id: admin.admin_id, username: admin.username, salon_id: admin.salon_id } });
        });
    });
});

app.post('/api/admins', authenticateAdminToken, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'username and password are required' });
        return;
    }
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            console.error('Error hashing password:', err);
            res.status(500).json({ error: 'Failed to create admin' });
            return;
        }
        const q = 'INSERT INTO Admins (username, password_hash) VALUES (?, ?)';
        db.query(q, [username.trim(), hash], (err, result) => {
            if (err) {
                console.error('Error creating admin:', err);
                if (err.code === 'ER_DUP_ENTRY') {
                    res.status(409).json({ error: 'Username already exists' });
                } else {
                    res.status(500).json({ error: 'Failed to create admin' });
                }
                return;
            }
            res.json({ message: 'Admin created', admin_id: result.insertId });
        });
    });
});

app.delete('/api/admins/:id', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!password) {
        res.status(400).json({ error: 'Password is required to delete admin' });
        return;
    }
    
    db.query('SELECT password_hash FROM Admins WHERE admin_id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error checking admin password:', err);
            res.status(500).json({ error: 'Failed to verify admin' });
            return;
        }
        
        if (results.length === 0) {
            res.status(404).json({ error: 'Admin not found' });
            return;
        }
        
        const admin = results[0];
        
        bcrypt.compare(password, admin.password_hash, (compareErr, isMatch) => {
            if (compareErr) {
                console.error('Error comparing passwords:', compareErr);
                res.status(500).json({ error: 'Failed to verify password' });
                return;
            }
            
            if (!isMatch) {
                res.status(401).json({ error: 'Incorrect password' });
                return;
            }
            
            db.query('SELECT COUNT(*) as count FROM Admins', (countErr, countResults) => {
                if (countErr) {
                    console.error('Error counting admins:', countErr);
                    res.status(500).json({ error: 'Failed to verify admin count' });
                    return;
                }
                
                const adminCount = countResults[0].count;
                
                if (adminCount <= 1) {
                    res.status(400).json({ error: 'Cannot delete the last admin account' });
                    return;
                }
                
                db.query('DELETE FROM Admins WHERE admin_id = ?', [id], (deleteErr, deleteResult) => {
                    if (deleteErr) {
                        console.error('Error deleting admin:', deleteErr);
                        res.status(500).json({ error: 'Failed to delete admin' });
                        return;
                    }
                    res.json({ message: 'Admin deleted successfully' });
                });
            });
        });
    });
});

app.put('/api/admins/:id/change-password', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Current password and new password are required' });
        return;
    }
    
    if (newPassword.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters long' });
        return;
    }
    
    db.query('SELECT password_hash FROM Admins WHERE admin_id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error checking current admin password:', err);
            res.status(500).json({ error: 'Failed to verify current password' });
            return;
        }
        
        if (results.length === 0) {
            res.status(404).json({ error: 'Admin not found' });
            return;
        }
        
        const admin = results[0];
        
        bcrypt.compare(currentPassword, admin.password_hash, (compareErr, isMatch) => {
            if (compareErr) {
                console.error('Error comparing passwords:', compareErr);
                res.status(500).json({ error: 'Failed to verify current password' });
                return;
            }
            
            if (!isMatch) {
                res.status(401).json({ error: 'Current password is incorrect' });
                return;
            }
            
            bcrypt.hash(newPassword, 10, (hashErr, hashedPassword) => {
                if (hashErr) {
                    console.error('Error hashing new password:', hashErr);
                    res.status(500).json({ error: 'Failed to process new password' });
                    return;
                }
                
                db.query('UPDATE Admins SET password_hash = ? WHERE admin_id = ?', [hashedPassword, id], (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error('Error updating admin password:', updateErr);
                        res.status(500).json({ error: 'Failed to update password' });
                        return;
                    }
                    
                    if (updateResult.affectedRows === 0) {
                        res.status(404).json({ error: 'Admin not found' });
                        return;
                    }
                    
                    res.json({ message: 'Password changed successfully' });
                });
            });
        });
    });
});

app.delete('/api/appointments/:id', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM Appointments WHERE appointment_id = ?', [id], (err, result) => {
        if (err) {
            console.error('Error deleting appointment:', err);
            res.status(500).json({ error: 'Failed to delete appointment' });
            return;
        }
        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Appointment not found' });
            return;
        }
        res.json({ message: 'Appointment deleted successfully' });
    });
});

app.put('/api/customers/:id', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    let { full_name, phone, email } = req.body;

    if (!full_name || !phone || !email) {
        res.status(400).json({ error: 'full_name, phone and email are required' });
        return;
    }

    full_name = full_name.trim();
    phone = phone.trim();
    email = email.trim().toLowerCase();

    const query = 'UPDATE Customers SET full_name = ?, phone = ?, email = ? WHERE customer_id = ?';
    db.query(query, [full_name, phone, email, id], (err, result) => {
        if (err) {
            console.error('Error updating customer:', err);
            res.status(500).json({ error: 'Failed to update customer' });
            return;
        }
        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }
        res.json({ message: 'Customer updated successfully' });
    });
});


app.delete('/api/customers/:id', authenticateAdminToken, (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM Appointments WHERE customer_id = ?', [id], (err, result) => {
        if (err) {
            console.error('Error deleting customer appointments:', err);
            res.status(500).json({ error: 'Failed to delete customer appointments' });
            return;
        }
        
        db.query('DELETE FROM Customers WHERE customer_id = ?', [id], (err, result) => {
            if (err) {
                console.error('Error deleting customer:', err);
                res.status(500).json({ error: 'Failed to delete customer' });
                return;
            }
            if (result.affectedRows === 0) {
                res.status(404).json({ error: 'Customer not found' });
                return;
            }
            res.json({ message: 'Customer and associated appointments deleted successfully' });
        });
    });
});

app.get('/api/customers/:id', authenticateToken, (req, res) => {
    const customerId = req.params.id;
    
    if (req.user.customer_id != customerId) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const query = 'SELECT customer_id, full_name, email, phone, created_at FROM Customers WHERE customer_id = ?';
    db.query('SELECT customer_id, full_name, email, phone, created_at FROM Customers WHERE customer_id = ?', 
        [customerId], 
        (err, results) => {
            if (err) {
                console.error('Error fetching customer:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (results.length === 0) {
                return res.status(404).json({ error: 'Customer not found' });
            }
            res.json(results[0]);
        }
    );
});

app.put('/api/customers/:id', authenticateToken, (req, res) => {
    const customerId = req.params.id;
    const { full_name, phone, email } = req.body;
    
    if (req.user.customer_id != customerId) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!full_name || !phone) {
        return res.status(400).json({ error: 'Name and phone are required' });
    }
    
    const query = 'UPDATE Customers SET full_name = ?, phone = ? WHERE customer_id = ?';
    db.query(
        'UPDATE Customers SET full_name = ?, phone = ? WHERE customer_id = ?',
        [full_name, phone, customerId],
        (err, result) => {
            if (err) {
                console.error('Error updating customer:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Profile updated successfully' });
        }
    );
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});



app.get("/api/booked-slots", (req, res) => {

  const { date } = req.query;

  const sql = `
    SELECT appointment_time 
    FROM appointments 
    WHERE appointment_date = ?
  `;

  db.query(sql, [date], (err, results) => {

    if(err){
      console.error(err);
      return res.status(500).json([]);
    }

    const booked = results.map(r =>
      r.appointment_time.substring(0,5)
    );

    res.json(booked);

  });

});

app.patch('/api/appointments/:id/accept', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(
            "UPDATE Appointments SET status = 'Confirmed' WHERE appointment_id = ?",
            [id]
        );Scheduled
        const [rows] = await db.execute(`
            SELECT 
                c.email, 
                c.full_name, 
                s.service_name, 
                a.appointment_date, 
                a.appointment_time
            FROM Appointments a
            JOIN Customers c ON a.customer_id = c.customer_id
            JOIN Services s ON a.service_id = s.service_id
            WHERE a.appointment_id = ?
        `, [id]);

        if (!rows.length) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        const user = rows[0];

        console.log("Sending email to:", user.email);
        await transporter.sendMail({
            from: `"SalonSnap" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Your Appointment is Confirmed ✅",
            html: `
                <h2>Hello ${user.full_name},</h2>
                <p>Your appointment has been <b>confirmed</b>.</p>
                <p><b>Service:</b> ${user.service_name}</p>
                <p><b>Date:</b> ${user.appointment_date}</p>
                <p><b>Time:</b> ${user.appointment_time}</p>
                <br/>
                <p>Thank you for choosing <b>SalonSnap</b> 💇‍♀️</p>
            `
        });

        console.log("✅ Email sent successfully");

        res.json({ success: true, message: "Appointment accepted & email sent" });

    } catch (err) {
        console.error("❌ Accept appointment error:", err);
        res.status(500).json({ error: "Failed to accept appointment" });
    }
});

app.post("/api/payment", authenticateToken, (req,res)=>{
    const {appointment_id, method} = req.body;
    const payment_id = "PAY_" + Math.floor(Math.random()*100000000);
    const query = `
        UPDATE Appointments
        SET payment_status='Paid',
        payment_method=?,
        payment_id=?
        WHERE appointment_id=?`;

    db.query(query,[method,payment_id,appointment_id],(err,result)=>{
        if(err){
            console.log(err);
            return res.status(500).json({error:"Payment failed"});
        }
        res.json({
            success:true,
            payment_id:payment_id
        });
    });
});

app.post('/api/payment/confirm', authenticateToken, (req, res) => {
    const { 
        appointment_id, 
        method, 
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature 
    } = req.body;
    
    const payment_id = razorpay_payment_id || "PAY_" + Math.floor(Math.random()*100000000);
    
    const query = `
        UPDATE Appointments
        SET payment_status='Paid',
            payment_method=?,
            payment_id=?
        WHERE appointment_id=?
    `;

    db.query(query, [method, payment_id, appointment_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ success: false, error: "Payment failed" });
        }
        res.json({
            success: true,
            payment_id: payment_id
        });
    });
});

app.get('/api/appointments/:id/payment-details', authenticateToken, (req, res) => {
    const appointmentId = req.params.id;
    const customerId = req.user.customer_id;

    console.log("=================================");
    console.log(`🔍 PAYMENT-DETAILS REQUEST:`);
    console.log(`   Appointment ID from URL: ${appointmentId}`);
    console.log(`   Customer ID from token: ${customerId}`);
    console.log(`   Looking for appointment belonging to customer: ${customerId}`);
    console.log("=================================");

    const query = `
        SELECT 
            a.appointment_id,
            a.appointment_date,
            a.appointment_time,
            a.payment_status,
            c.full_name as customer_name,
            s.service_name,
            s.price,
            s.duration_minutes
        FROM Appointments a
        JOIN Customers c ON a.customer_id = c.customer_id
        JOIN Services s ON a.service_id = s.service_id
        WHERE a.appointment_id = ? AND a.customer_id = ?
    `;

    db.query(query, [appointmentId, customerId], (err, results) => {
        if (err) {
            console.error('❌ Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        console.log(`   Query returned ${results.length} results`);
        
        if (results.length === 0) {
            db.query('SELECT customer_id FROM Appointments WHERE appointment_id = ?', [appointmentId], (err2, checkResults) => {
                if (err2) {
                    console.error('Error checking appointment:', err2);
                } else if (checkResults.length > 0) {
                    console.log(`   ❌ Appointment ${appointmentId} EXISTS but belongs to customer ${checkResults[0].customer_id}, not ${customerId}`);
                } else {
                    console.log(`   ❌ Appointment ${appointmentId} does NOT exist in database`);
                }
            });
            
            return res.status(404).json({ error: 'Appointment not found' });
        }
        
        console.log(`✅ Success! Found appointment ${appointmentId} for customer ${customerId}`);
        res.json(results[0]);
    });
});

app.get('/api/appointments/:id/receipt', authenticateToken, (req, res) => {
    const appointmentId = req.params.id;
    const customerId = req.user.customer_id;

    const query = `
        SELECT 
            a.appointment_id,
            a.appointment_date,
            a.appointment_time,
            a.payment_status,
            a.payment_method,
            a.payment_id,
            a.notes,
            c.full_name as customer_name,
            c.email as customer_email,
            c.phone as customer_phone,
            s.service_name,
            s.price,
            s.duration_minutes,
            st.full_name as staff_name
        FROM Appointments a
        JOIN Customers c ON a.customer_id = c.customer_id
        JOIN Services s ON a.service_id = s.service_id
        LEFT JOIN Staff st ON a.staff_id = st.staff_id
        WHERE a.appointment_id = ? AND a.customer_id = ?
    `;

    db.query(query, [appointmentId, customerId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: 'Receipt not found' });
        }

        const appointment = results[0];
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=receipt_${appointmentId}.pdf`);
        doc.pipe(res);
        doc.fontSize(20).text('SalonSnap', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text('Payment Receipt', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12);
        doc.text(`Receipt No: ${appointment.payment_id || 'N/A'}`);
        doc.text(`Date: ${new Date().toLocaleDateString()}`);
        doc.moveDown();
        doc.text('Customer Details:');
        doc.text(`Name: ${appointment.customer_name}`);
        doc.text(`Email: ${appointment.customer_email}`);
        doc.text(`Phone: ${appointment.customer_phone}`);
        doc.moveDown();
        doc.text('Appointment Details:');
        doc.text(`Service: ${appointment.service_name}`);
        doc.text(`Date: ${new Date(appointment.appointment_date).toLocaleDateString()}`);
        doc.text(`Time: ${appointment.appointment_time}`);
        doc.text(`Staff: ${appointment.staff_name || 'Not assigned'}`);
        doc.moveDown();
        doc.text('Payment Details:');
        doc.text(`Amount: ₹${appointment.price}`);
        doc.text(`Status: ${appointment.payment_status}`);
        doc.text(`Method: ${appointment.payment_method || 'N/A'}`);
        doc.moveDon();
        
        doc.text('Thank you for choosing SalonSnap!', { align: 'center' });
        
        doc.end();
    });
});

app.post("/send-message", async (req, res) => {
  const { name, email, subject, message } = req.body;

  try {
    await transporter.sendMail({
      from: `"SalonSnap Website" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: `📩 New Contact: ${subject}`,
      html: `
        <h2>New Contact Message</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Subject:</b> ${subject}</p>
        <p><b>Message:</b><br>${message}</p>
      `
    });

    await transporter.sendMail({
      from: `"SalonSnap" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "✨ We received your message - SalonSnap",
      html: `
        <div style="font-family: Arial; padding:20px">
          <h2>Hello ${name} 👋</h2>
          <p>Thank you for contacting <b>SalonSnap</b>.</p>
          <p>We have received your message and our team will contact you within 24 hours.</p>

          <hr>

          <h3>Your Message:</h3>
          <p>${message}</p>

          <br>
          <p>Regards,<br><b>SalonSnap Team 💇‍♀️</b></p>
        </div>
      `
    });

    res.json({ success: true });

  } catch (err) {
    console.log(" Mail error:", err);
    res.status(500).json({ success: false });
  }
});

app.post("/api/create-order", async (req, res) => {

    try {

        const { amount } = req.body;

        const order = await razorpay.orders.create({
            amount: amount * 100, 
            currency: "INR",
            receipt: "receipt_" + Date.now()
        });

        res.json(order);

    } catch (err) {

        console.log(err);
        res.status(500).send("Order creation failed");

    }

});


app.post('/api/payment-success', async (req, res) => {
    const { 
        appointment_id, 
        payment_id, 
        transaction_id, 
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature 
    } = req.body;

    try {
        await new Promise((resolve, reject) => {
            const query = `
                UPDATE Payments 
                SET payment_status = 'Completed', 
                    transaction_id = COALESCE(?, transaction_id),
                    razorpay_payment_id = COALESCE(?, razorpay_payment_id),
                    razorpay_order_id = COALESCE(?, razorpay_order_id),
                    razorpay_signature = COALESCE(?, razorpay_signature)
                WHERE payment_id = ?
            `;
            db.query(query, [transaction_id, razorpay_payment_id, razorpay_order_id, razorpay_signature, payment_id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        const payment = await new Promise((resolve, reject) => {
            const query = `
                SELECT p.*, 
                       c.full_name, c.email, c.phone,
                       a.notes as appointment_notes
                FROM Payments p
                JOIN Customers c ON p.customer_id = c.customer_id
                JOIN Appointments a ON p.appointment_id = a.appointment_id
                WHERE p.payment_id = ?
            `;
            db.query(query, [payment_id], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        const receiptData = {
            payment_id: payment.payment_id,
            amount: payment.amount,
            payment_method: payment.payment_method,
            payment_status: payment.payment_status,
            payment_date: payment.payment_date,
            transaction_id: payment.transaction_id || razorpay_payment_id
        };

        const appointmentData = {
            appointment_date: payment.appointment_date,
            appointment_time: payment.appointment_time,
            staff_name: payment.staff_name,
            notes: payment.appointment_notes
        };

        const customerData = {
            full_name: payment.full_name,
            email: payment.email,
            phone: payment.phone
        };

        const serviceData = {
            service_name: payment.service_name,
            price: payment.service_price,
            duration_minutes: payment.service_duration
        };
        const receipt = await generateReceipt(receiptData, appointmentData, customerData, serviceData);
        await new Promise((resolve, reject) => {
            const query = 'UPDATE Payments SET receipt_url = ? WHERE payment_id = ?';
            db.query(query, [receipt.filePath, payment_id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({
            success: true,
            message: 'Payment successful!',
            receipt_url: receipt.filePath,
            receipt_file: receipt.fileName,
            payment_id: payment.payment_id
        });

    } catch (error) {
        console.error('Error processing payment success:', error);
        res.status(500).json({ error: 'Failed to process payment' });
    }
});
app.get('/api/payments/customer/:customer_id', (req, res) => {
    const { customer_id } = req.params;
    
    const query = `
        SELECT p.*, 
               s.service_name,
               s.duration_minutes as service_duration,
               a.appointment_date,
               a.appointment_time,
               st.full_name as staff_name
        FROM Payments p
        JOIN Appointments a ON p.appointment_id = a.appointment_id
        JOIN Services s ON a.service_id = s.service_id
        LEFT JOIN Staff st ON a.staff_id = st.staff_id
        WHERE p.customer_id = ?
        ORDER BY p.payment_date DESC
    `;
    
    db.query(query, [customer_id], (err, results) => {
        if (err) {
            console.error('Error fetching customer payments:', err);
            return res.status(500).json({ error: 'Failed to fetch payments' });
        }
        res.json(results);
    });
});
app.get('/api/payments/:id', (req, res) => {
    const { id } = req.params;
    
    const query = `
        SELECT p.*, 
               c.full_name, c.email, c.phone,
               s.service_name,
               s.duration_minutes as service_duration,
               a.appointment_date, a.appointment_time,
               st.full_name as staff_name
        FROM Payments p
        JOIN Customers c ON p.customer_id = c.customer_id
        JOIN Appointments a ON p.appointment_id = a.appointment_id
        JOIN Services s ON a.service_id = s.service_id
        LEFT JOIN Staff st ON a.staff_id = st.staff_id
        WHERE p.payment_id = ?
    `;
    
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error fetching payment:', err);
            return res.status(500).json({ error: 'Failed to fetch payment' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        res.json(results[0]);
    });
});
app.get('/api/payments/appointment/:appointment_id', (req, res) => {
    const { appointment_id } = req.params;
    
    const query = 'SELECT * FROM Payments WHERE appointment_id = ? ORDER BY payment_id DESC LIMIT 1';
    db.query(query, [appointment_id], (err, results) => {
        if (err) {
            console.error('Error fetching payment:', err);
            return res.status(500).json({ error: 'Failed to fetch payment' });
        }
        res.json(results[0] || null);
    });
});
app.put('/api/payments/:payment_id/status', (req, res) => {
    const { payment_id } = req.params;
    const { payment_status } = req.body;

    if (!payment_status) {
        return res.status(400).json({ error: 'payment_status is required' });
    }

    const query = 'UPDATE Payments SET payment_status = ? WHERE payment_id = ?';
    
    db.query(query, [payment_status, payment_id], (err, result) => {
        if (err) {
            console.error('Error updating payment status:', err);
            return res.status(500).json({ error: 'Failed to update payment status' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Payment record not found' });
        }
        
        console.log(`✅ Payment ${payment_id} status updated to ${payment_status}`);
        res.json({ message: 'Payment status updated successfully' });
    });
});
app.post('/api/generate-receipt', async (req, res) => {
    const { payment_id } = req.body;
    
    if (!payment_id) {
        return res.status(400).json({ error: 'payment_id is required' });
    }
    
    try {
        const payment = await new Promise((resolve, reject) => {
            const query = `
                SELECT p.*, 
                       c.full_name, c.email, c.phone,
                       a.notes as appointment_notes
                FROM Payments p
                JOIN Customers c ON p.customer_id = c.customer_id
                JOIN Appointments a ON p.appointment_id = a.appointment_id
                WHERE p.payment_id = ?
            `;
            db.query(query, [payment_id], (err, results) => {
                if (err) reject(err);
                else resolve(results[0]);
            });
        });
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        const receiptData = {
            payment_id: payment.payment_id,
            amount: payment.amount,
            payment_method: payment.payment_method,
            payment_status: payment.payment_status,
            payment_date: payment.payment_date,
            transaction_id: payment.transaction_id || 'CASH_' + payment.payment_id
        };
        
        const appointmentData = {
            appointment_date: payment.appointment_date,
            appointment_time: payment.appointment_time,
            staff_name: payment.staff_name,
            notes: payment.appointment_notes
        };
        
        const customerData = {
            full_name: payment.full_name,
            email: payment.email,
            phone: payment.phone
        };
        
        const serviceData = {
            service_name: payment.service_name,
            price: payment.service_price,
            duration_minutes: payment.service_duration
        };
        
        const { generateReceipt } = require('./utils/receipt');
        const receipt = await generateReceipt(receiptData, appointmentData, customerData, serviceData);
        
        await new Promise((resolve, reject) => {
            const query = 'UPDATE Payments SET receipt_url = ? WHERE payment_id = ?';
            db.query(query, [receipt.filePath, payment_id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        res.json({
            success: true,
            message: 'Receipt generated successfully',
            receipt_url: receipt.filePath
        });
        
    } catch (error) {
        console.error('Error generating receipt:', error);
        res.status(500).json({ error: 'Failed to generate receipt' });
    }
});
function getCustomerIdFromSupabaseId(supabaseUserId, callback) {
    db.query('SELECT customer_id FROM User_Mappings WHERE supabase_user_id = ?', [supabaseUserId], (err, results) => {
        if (err) {
            callback(err, null);
            return;
        }
        if (results.length > 0) {
            callback(null, results[0].customer_id);
            return;
        }
        db.query('SELECT customer_id FROM Customers WHERE supabase_user_id = ?', [supabaseUserId], (err2, results2) => {
            if (err2) {
                callback(err2, null);
                return;
            }
            if (results2.length > 0) {
                callback(null, results2[0].customer_id);
            } else {
                callback(null, null);
            }
        });
    });
}
app.post('/api/app/auth/sync', (req, res) => {
    const { supabase_user_id, email, full_name, phone } = req.body;
    
    if (!supabase_user_id || !email) {
        return res.status(400).json({ error: 'supabase_user_id and email are required' });
    }
    
    db.query('SELECT * FROM User_Mappings WHERE supabase_user_id = ?', [supabase_user_id], (err, existing) => {
        if (err) {
            console.error('Error checking mapping:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (existing.length > 0) {
            return res.json({ 
                message: 'User already synced',
                customer_id: existing[0].customer_id,
                already_exists: true
            });
        }
        
        db.query('SELECT customer_id, full_name, phone FROM Customers WHERE email = ?', [email], (err2, customer) => {
            if (err2) {
                console.error('Error checking customer:', err2);
                return res.status(500).json({ error: 'Database error' });
            }
            
            let customer_id;
            
            if (customer.length > 0) {
                customer_id = customer[0].customer_id;
                db.query('UPDATE Customers SET supabase_user_id = ? WHERE customer_id = ?', [supabase_user_id, customer_id], (err3) => {
                    if (err3) console.error('Error updating customer:', err3);
                });
                
                db.query('INSERT INTO User_Mappings (supabase_user_id, customer_id, email) VALUES (?, ?, ?)',
                    [supabase_user_id, customer_id, email], (err5) => {
                        if (err5) console.error('Error creating mapping:', err5);
                    });
                
                return res.json({
                    message: 'User synced successfully',
                    customer_id: customer_id,
                    already_exists: true
                });
            } else {
                const newFullName = full_name || email.split('@')[0];
                const newPhone = phone || '';
                
                db.query('INSERT INTO Customers (full_name, email, phone, supabase_user_id) VALUES (?, ?, ?, ?)', 
                    [newFullName, email, newPhone, supabase_user_id], 
                    (err4, result) => {
                        if (err4) {
                            console.error('Error creating customer:', err4);
                            return res.status(500).json({ error: 'Failed to create customer' });
                        }
                        customer_id = result.insertId;
                        
                        db.query('INSERT INTO User_Mappings (supabase_user_id, customer_id, email) VALUES (?, ?, ?)',
                            [supabase_user_id, customer_id, email], (err5) => {
                                if (err5) console.error('Error creating mapping:', err5);
                            });
                        
                        return res.json({
                            message: 'User synced successfully',
                            customer_id: customer_id,
                            new_customer: true
                        });
                    }
                );
            }
        });
    });
});
app.get('/api/app/services', (req, res) => {
    const query = 'SELECT service_id, service_name, description, price, duration_minutes, is_premium FROM Services ORDER BY is_premium DESC, service_name';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching services for app:', err);
            return res.status(500).json({ error: 'Failed to fetch services' });
        }
        
        const services = results.map(s => ({
            id: s.service_id,
            name: s.service_name,
            description: s.description,
            price: parseFloat(s.price),
            duration: s.duration_minutes,
            is_premium: s.is_premium === 1
        }));
        
        res.json(services);
    });
});
app.post('/api/app/appointments', (req, res) => {
    const { supabase_user_id, service_id, appointment_date, appointment_time, notes, payment_method } = req.body;
    
    if (!supabase_user_id || !service_id || !appointment_date || !appointment_time) {
        return res.status(400).json({ error: 'supabase_user_id, service_id, appointment_date, appointment_time are required' });
    }
    
    getCustomerIdFromSupabaseId(supabase_user_id, (err, customer_id) => {
        if (err) {
            console.error('Error getting customer_id:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!customer_id) {
            return res.status(404).json({ error: 'User not found. Please sync first.' });
        }
        
        db.query('SELECT service_name, price FROM Services WHERE service_id = ?', [service_id], (err2, serviceResult) => {
            if (err2 || serviceResult.length === 0) {
                console.error('Error fetching service:', err2);
                return res.status(500).json({ error: 'Service not found' });
            }
            
            const service = serviceResult[0];
            const appointmentNotes = notes && notes.trim() ? notes.trim() : null;
            
            const appointmentQuery = `INSERT INTO Appointments (customer_id, service_id, appointment_date, appointment_time, notes, status) VALUES (?, ?, ?, ?, ?, 'Scheduled')`;
            
            db.query(appointmentQuery, [customer_id, service_id, appointment_date, appointment_time, appointmentNotes], (err3, result) => {
                if (err3) {
                    console.error('Error creating appointment:', err3);
                    return res.status(500).json({ error: 'Failed to create appointment' });
                }
                
                const appointment_id = result.insertId;
                
                const paymentQuery = `INSERT INTO Payments (appointment_id, customer_id, amount, payment_method, payment_status, service_name, service_price, appointment_date, appointment_time) VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`;
                
                db.query(paymentQuery, [appointment_id, customer_id, service.price, payment_method || 'Cash', service.service_name, service.price, appointment_date, appointment_time], (err4) => {
                    if (err4) {
                        console.error('Error creating payment record:', err4);
                    }
                    
                    res.json({
                        success: true,
                        message: 'Appointment created successfully',
                        appointment_id: appointment_id,
                        service_name: service.service_name,
                        price: service.price,
                        date: appointment_date,
                        time: appointment_time
                    });
                });
            });
        });
    });
});
app.get('/api/app/appointments', (req, res) => {
    const { supabase_user_id, status } = req.query;
    
    if (!supabase_user_id) {
        return res.status(400).json({ error: 'supabase_user_id is required' });
    }
    
    getCustomerIdFromSupabaseId(supabase_user_id, (err, customer_id) => {
        if (err) {
            console.error('Error getting customer_id:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!customer_id) {
            return res.status(404).json({ error: 'User not found. Please sync first.' });
        }
        
        let query = `SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status as appointment_status, a.notes, s.service_name, s.price, s.duration_minutes, st.full_name as staff_name, p.payment_status, p.payment_method FROM Appointments a JOIN Services s ON a.service_id = s.service_id LEFT JOIN Staff st ON a.staff_id = st.staff_id LEFT JOIN Payments p ON a.appointment_id = p.appointment_id WHERE a.customer_id = ?`;
        
        const params = [customer_id];
        
        if (status && status !== 'all') {
            query += ' AND a.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
        
        db.query(query, params, (err2, appointments) => {
            if (err2) {
                console.error('Error fetching appointments:', err2);
                return res.status(500).json({ error: 'Failed to fetch appointments' });
            }
            
            const formatted = appointments.map(a => ({
                id: a.appointment_id,
                date: a.appointment_date,
                time: a.appointment_time,
                status: a.appointment_status,
                notes: a.notes,
                service: {
                    name: a.service_name,
                    price: parseFloat(a.price),
                    duration: a.duration_minutes
                },
                staff: a.staff_name,
                payment: {
                    status: a.payment_status || 'Pending',
                    method: a.payment_method || 'Cash'
                }
            }));
            
            res.json(formatted);
        });
    });
});
app.get('/api/app/appointments/:id', (req, res) => {
    const { id } = req.params;
    const { supabase_user_id } = req.query;
    
    if (!supabase_user_id) {
        return res.status(400).json({ error: 'supabase_user_id is required' });
    }
    
    getCustomerIdFromSupabaseId(supabase_user_id, (err, customer_id) => {
        if (err || !customer_id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const query = `SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status, a.notes, s.service_name, s.price, s.duration_minutes, st.full_name as staff_name, p.payment_status, p.payment_method, p.receipt_url FROM Appointments a JOIN Services s ON a.service_id = s.service_id LEFT JOIN Staff st ON a.staff_id = st.staff_id LEFT JOIN Payments p ON a.appointment_id = p.appointment_id WHERE a.appointment_id = ? AND a.customer_id = ?`;
        
        db.query(query, [id, customer_id], (err2, results) => {
            if (err2 || results.length === 0) {
                return res.status(404).json({ error: 'Appointment not found' });
            }
            
            const a = results[0];
            res.json({
                id: a.appointment_id,
                date: a.appointment_date,
                time: a.appointment_time,
                status: a.status,
                notes: a.notes,
                service: {
                    name: a.service_name,
                    price: parseFloat(a.price),
                    duration: a.duration_minutes
                },
                staff: a.staff_name,
                payment: {
                    status: a.payment_status || 'Pending',
                    method: a.payment_method || 'Cash',
                    receipt_url: a.receipt_url
                }
            });
        });
    });
});
app.post('/api/app/payment', (req, res) => {
    const { supabase_user_id, appointment_id, payment_method } = req.body;
    
    if (!supabase_user_id || !appointment_id) {
        return res.status(400).json({ error: 'supabase_user_id and appointment_id are required' });
    }
    
    getCustomerIdFromSupabaseId(supabase_user_id, (err, customer_id) => {
        if (err || !customer_id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        db.query('SELECT service_id FROM Appointments WHERE appointment_id = ? AND customer_id = ?', [appointment_id, customer_id], (err2, appointment) => {
            if (err2 || appointment.length === 0) {
                return res.status(404).json({ error: 'Appointment not found' });
            }
            
            db.query('UPDATE Payments SET payment_status = "Completed", payment_method = ? WHERE appointment_id = ?', [payment_method || 'Online', appointment_id], (err3) => {
                if (err3) {
                    console.error('Error updating payment:', err3);
                    return res.status(500).json({ error: 'Payment failed' });
                }
                
                res.json({
                    success: true,
                    message: 'Payment successful',
                    appointment_id: appointment_id
                });
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`\n🌐 Visit: http://localhost:${PORT}\n`);
});

app.post('/api/auth/register', (req, res) => {
    const { full_name, email, phone, password } = req.body;
    
    if (!full_name || !email || !phone || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    const checkQuery = 'SELECT customer_id FROM Customers WHERE email = ? OR phone = ?';
    db.query(checkQuery, [email, phone], (err, results) => {
        if (err) {
            console.error('Error checking user:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length > 0) {
            return res.status(409).json({ error: 'User with this email or phone already exists' });
        }
                bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                console.error('Error hashing password:', err);
                return res.status(500).json({ error: 'Registration failed' });
            }
            
            const insertQuery = `
                INSERT INTO Customers (full_name, email, phone, password_hash, created_at)
                VALUES (?, ?, ?, ?, NOW())
            `;
            
            db.query(insertQuery, [full_name.trim(), email.trim().toLowerCase(), phone.trim(), hash], (err, result) => {
                if (err) {
                    console.error('Error registering user:', err);
                    return res.status(500).json({ error: 'Registration failed' });
                }
                
                res.status(201).json({
                    message: 'Registration successful',
                    user: {
                        customer_id: result.insertId,
                        full_name: full_name,
                        email: email,
                        phone: phone
                    }
                });
            });
        });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const query = 'SELECT customer_id, full_name, email, phone, password_hash FROM Customers WHERE email = ?';
    db.query(query, [email.trim().toLowerCase()], (err, results) => {
        if (err) {
            console.error('Error finding user:', err);
            return res.status(500).json({ error: 'Login failed' });
        }
        
        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        const user = results[0];
        
        bcrypt.compare(password, user.password_hash, (err, isMatch) => {
            if (err) {
                console.error('Error comparing passwords:', err);
                return res.status(500).json({ error: 'Login failed' });
            }
            
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }
            
            res.json({
                message: 'Login successful',
                user: {
                    customer_id: user.customer_id,
                    full_name: user.full_name,
                    email: user.email,
                    phone: user.phone
                }
            });
        });
    });
});

