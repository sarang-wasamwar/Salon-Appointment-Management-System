# SalonSnap – Salon Appointment & Management System

A full-stack salon appointment and management system developed as a Community Engagement Project (CEP) for salon businesses. The platform helps salons manage appointments, services, staff, customers, and communication through a modern web application.

---

## 🚀 Features
- Customer appointment booking
- Service browsing (Regular & Premium)
- Admin dashboard
- Staff management
- Customer management
- Contact & inquiry system
- Appointment tracking
- PDF receipt generation
- Email notifications
- Service image uploads

---

## 🛠️ Tech Stack

### 💻 Web
<p>
<img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white"/>
<img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white"/>
<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black"/>
<img src="https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white"/>
<img src="https://img.shields.io/badge/XAMPP-FB7A24?style=for-the-badge&logo=xampp&logoColor=white"/>
<img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
<img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white"/>
<img src="https://img.shields.io/badge/Razorpay-0C2451?style=for-the-badge&logo=razorpay&logoColor=white"/>
<img src="https://img.shields.io/badge/bcrypt-121212?style=for-the-badge"/>
<img src="https://img.shields.io/badge/Multer-FF6B6B?style=for-the-badge"/>
<img src="https://img.shields.io/badge/Nodemailer-0099E5?style=for-the-badge&logo=gmail&logoColor=white"/>
<img src="https://img.shields.io/badge/PDFKit-D32F2F?style=for-the-badge&logo=adobeacrobatreader&logoColor=white"/>
</p>

---

## 📂 Project Structure

```bash
salon_management/
│
├── node_modules/
│
├── public/
│   ├── css/
│   ├── js/
│   ├── receipts/
│   ├── uploads/
│   │
│   ├── about.html
│   ├── admin.html
│   ├── appointment.html
│   ├── contact.html
│   ├── dashboard.html
│   ├── index.html
│   ├── login.html
│   ├── payment.html
│   ├── payment-success.html
│   ├── services.html
│   └── success.html
│
├── screenshots/
│   └── images
│
├── utils/
│   └── receipt.js
│
├── .env
├── .gitignore
├── database.sql
├── email.js
├── package.json
├── package-lock.json
├── server.js
├── test-email.js
├── LICENSE
└── README.md
```

---

## ⚙️ Installation

### 1️⃣ Clone Repository

```bash
git clone https://github.com/sarang-wasamwar/Salon-Appointment-Management-System.git
```

### 2️⃣ Open Project

```bash
cd Salon-Appointment-Management-System
```

### 3️⃣ Install Dependencies

```bash
npm install
```

### 4️⃣ Configure Environment Variables

Create a `.env` file:

```env
# Database Configuration
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=YOUR_PASSWORD
DB_NAME=YOUR_DB_NAME
DB_PORT=YOUR_XAMPP_PORT

# Server Configuration
PORT=3000

# Email Configuration
EMAIL_USER=YOUR_EMAIL_ADDRESS
EMAIL_PASS=YOUR_APP_PASSWORD

# Razorpay Configuration
RAZORPAY_KEY_ID=YOUR_RAZORPAY_KEY_ID
RAZORPAY_SECRET=YOUR_RAZORPAY_SECRET

# JWT Secret
JWT_SECRET=JWT_SECRET_CODE
```

### 🗄️ Database Setup (XAMPP)

This project uses **MySQL from XAMPP** as the local database server.

#### Steps:
1. Install and open **XAMPP**
2. Start:
   - Apache
   - MySQL
3. Open:
   
```bash
http://localhost/phpmyadmin
```

4. Create a new database:

```sql
SalonSnap
```

5. Import:

```bash
database.sql
```

### 6️⃣ Run Server

```bash
npm start
```
or
```bash
node server.js
```

Server will run on:

```bash
http://localhost:3000
```

---

## 🔐 Security Features

- bcrypt password hashing
- Parameterized SQL queries
- CORS middleware
- Input validation

---

## 📌 Future Scope

- SMS notifications
- Revenue analytics dashboard
- Multi-location salon support

---

## 👨‍💻 Contributors

- Sarang Wasamwar
- Shubham Navale [GitHub: https://github.com/Shubham21042007 ]
- Ayush Thakare [GitHub: https://github.com/Ayu5h-2005 ]

---

## 🎓 Academic Information

Community Engagement Project (CEP)  
Department of Computer Engineering  
PCCOE – Pimpri Chinchwad College of Engineering

---

## 📜 License

This project is developed for educational and community engagement purposes.

---

> [!NOTE]
> - The project UI may contain a few minor responsiveness and styling issues.  
> - Since the project uses **XAMPP MySQL** for local database management, understanding and configuring database connectivity may require some basic knowledge of XAMPP, phpMyAdmin, and environment variable setup.  
> - Ensure that Apache and MySQL services are running properly in XAMPP before starting the server.
