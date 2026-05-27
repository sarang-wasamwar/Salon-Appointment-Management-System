CREATE DATABASE IF NOT EXISTS SalonSnap;
USE SalonSnap;

DROP TABLE IF EXISTS Appointments_audit;
DROP TABLE IF EXISTS Services_audit;
DROP TABLE IF EXISTS Staff_audit;
DROP TABLE IF EXISTS Payments;
DROP TABLE IF EXISTS ServiceImages;
DROP TABLE IF EXISTS User_Mappings;
DROP TABLE IF EXISTS Appointments;
DROP TABLE IF EXISTS Messages;
DROP TABLE IF EXISTS Services;
DROP TABLE IF EXISTS Customers;
DROP TABLE IF EXISTS Staff;
DROP TABLE IF EXISTS Admins;
DROP TABLE IF EXISTS Salons;

CREATE TABLE Staff (
    staff_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    phone VARCHAR(15) UNIQUE,
    email VARCHAR(100) UNIQUE,
    hire_date date,
    salary DECIMAL(10,2),
    salon_id INT(11) NULL,
    FOREIGN KEY(salon_id) REFERENCES Salons(salon_id)  
);

CREATE TABLE Customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(15),
    email VARCHAR(100),
    password_hash VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
);

alter table Customers add column supabase_user_id varchar(100) null UNIQUE;

CREATE TABLE Services (
    service_id INT AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    duration_minutes INT NOT NULL,
    is_premium TINYINT(1) DEFAULT 0,
    salon_id INT(11) NULL,
    FOREIGN KEY(salon_id) REFERENCES Salons(salon_id)
);

CREATE TABLE IF NOT EXISTS Payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL,
    customer_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method ENUM('Online', 'Cash') NOT NULL,
    payment_status ENUM('Pending', 'Completed', 'Failed', 'Refunded') DEFAULT 'Pending',
    transaction_id VARCHAR(100) NULL,
    razorpay_payment_id VARCHAR(100) NULL,
    razorpay_order_id VARCHAR(100) NULL,
    razorpay_signature VARCHAR(255) NULL,
    receipt_url VARCHAR(500) NULL,
    service_name VARCHAR(100) NULL,
    service_price DECIMAL(10,2) NULL,
    service_duration INT NULL,
    appointment_date DATE NULL,
    appointment_time TIME NULL,
    staff_name VARCHAR(100) NULL,
    notes TEXT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (appointment_id) REFERENCES Appointments(appointment_id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES Customers(customer_id) ON DELETE CASCADE,
    INDEX idx_appointment (appointment_id),
    INDEX idx_customer (customer_id),
    INDEX idx_status (payment_status)
);



CREATE TABLE Appointments (
    appointment_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    staff_id INT NOT NULL,
    service_id INT NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    status VARCHAR(20) DEFAULT 'Scheduled',
    notes TEXT,
    FOREIGN KEY (customer_id) REFERENCES Customers(customer_id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES Services(service_id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES Staff(staff_id) ON DELETE SET NULL 
);

alter table Appointments add column payment_id int null;
alter table Appointments add FOREIGN key (payment_id) REFERENCES Payments(payment_id) on delete set null;
alter table Appointments add column payment_status varchar(20) default 'Pending';
alter table Appointments add FOREIGN KEY(payment_status) REFERENCES Payments(payment_status);
alter table Appointments add column payment_method varchar(50) null;
alter table Appointments add FOREIGN KEY(payment_method) REFERENCES Payments(payment_method);

CREATE TABLE Messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    subject varchar(150) Default Null,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Admins (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

alter table Admins add column salon_id INT(11) NULL;
alter table Admins ADD FOREIGN KEY(salon_id) REFERENCES Salons(salon_id);

CREATE TABLE IF NOT EXISTS ServiceImages (
    image_id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES Services(service_id) ON DELETE CASCADE,
    INDEX idx_service (service_id)
);

CREATE TABLE IF NOT EXISTS User_Mappings (
    mapping_id INT AUTO_INCREMENT PRIMARY KEY,
    supabase_user_id VARCHAR(100) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES Customers(customer_id) ON DELETE CASCADE,
    INDEX idx_supabase_id (supabase_user_id),
    INDEX idx_email (email)
);

CREATE TABLE IF NOT EXISTS Salons (
    salon_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(150) NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO Staff (full_name, role, phone, email, hire_date, salary) VALUES
('Ananya Sharma', 'Senior Hair Stylist & Creative Director', '+91 98765 10001', 'ananya.sharma@salonsnap.com', '2020-01-15', 65000.00),
('Rohan Mehta', 'Master Barber & Beard Specialist', '+91 98765 10002', 'rohan.mehta@salonsnap.com', '2020-03-10', 58000.00),
('Priya Kapoor', 'Lead Aesthetician & Skin Expert', '+91 98765 10003', 'priya.kapoor@salonsnap.com', '2019-06-20', 72000.00),
('Neha Verma', 'Nail Art & Beauty Specialist', '+91 98765 10005', 'neha.verma@salonsnap.com', '2021-02-14', 45000.00);

INSERT INTO Customers (full_name, phone, email) VALUES
('Pratik Jadhav', '+91 7638929122', 'pratik.j@email.com'),
('Pranav Sarwade', '+91 8900223432', 'pranav.sarwade@email.com'),
('Mahesh Avhad', '+91 7654389074', 'mahesh.avhad@email.com'),
('Siddhesh Patil', '+91 9922118765', 'siddhehs.p@email.com'),
('Atharv Shete', '+91 7645321189', 'atharv.s@email.com');

INSERT INTO Services (service_name, description, price, duration_minutes, is_premium) VALUES
('Classic Haircut', 'Professional haircut with styling', 800.00, 45, 0),
('Womens Haircut', 'Haircut with wash and blow dry', 1200.00, 60, 0),
('Hair Coloring', 'Full hair coloring service', 4000.00, 120, 0),
('Highlights', 'Partial or full highlights', 2500.00, 150, 0),
('Blow Dry & Style', 'Professional blow dry and styling', 1200.00, 30, 0),
('Basic Facial', 'Deep cleansing facial treatment', 1200.00, 60, 0),
('Anti-Aging Facial', 'Advanced anti-aging treatment', 1500.00, 75, 0),
('Acne Treatment', 'Specialized acne care facial', 900.00, 60, 0),
('Beard Trim', 'Professional beard shaping and trim', 400.00, 30, 0),
('Hot Towel Shave', 'Traditional hot towel straight razor shave', 300.00, 45, 0),
('Manicure', 'Complete nail care for hands', 1000.00, 45, 0),
('Pedicure', 'Complete nail care for feet', 1000.00, 60, 0);

INSERT INTO Services (service_name, description, price, duration_minutes, is_premium) VALUES
('Luxury Spa Package', 'Complete spa experience with massage, facial, and body treatment', 3500.00, 180, 1),
('Gold Facial Treatment', 'Premium facial with 24k gold infusion for ultimate rejuvenation', 1800.00, 90, 1),
('Diamond Glow Treatment', 'Advanced exfoliation and infusion treatment for radiant skin', 3000.00, 75, 1),
('Platinum Hair Treatment', 'Intensive hair restoration and keratin treatment', 3500.00, 120, 1),
('VIP Bridal Package', 'Complete bridal preparation including hair, makeup, and skincare', 7000.00, 240, 1),
('Executive Grooming Suite', 'Premium grooming experience for professionals', 1500.00, 90, 1);

INSERT INTO Appointments (customer_id, service_id, staff_id, appointment_date, appointment_time, status, notes) VALUES
(1, 2, 1, '2024-11-15', '10:00:00', 'Scheduled', 'Customer prefers layered cut'),
(2, 1, 2, '2024-11-15', '14:00:00', 'Scheduled', NULL),
(3, 6, 3, '2024-11-16', '11:00:00', 'Scheduled', 'First time customer, sensitive skin'),
(4, 11, 4, '2024-11-16', '15:30:00', 'Scheduled', NULL),
(5, 13, 1, '2024-11-17', '09:00:00', 'Scheduled', 'Anniversary special - wants luxury experience');

INSERT INTO Admins (username, password_hash) VALUES
('admin', '$2b$10$jerPWO5ZLWQ2lSmt5Cc4ee0lgfrEpGwQjyDjDDzEc4wBj9MT1UUQy');


CREATE TABLE IF NOT EXISTS Staff_Audit (
    audit_id INT(11) AUTO_INCREMENT PRIMARY KEY,
    staff_id INT(11) NOT NULL,
    action_type ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    old_full_name VARCHAR(100),
    new_full_name VARCHAR(100),
    old_role VARCHAR(50),
    new_role VARCHAR(50),
    old_salary DECIMAL(10,2),
    new_salary DECIMAL(10,2),
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Services_Audit (
    audit_id INT(11) AUTO_INCREMENT PRIMARY KEY,
    service_id INT(11) NOT NULL,
    action_type ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    old_service_name VARCHAR(100),
    new_service_name VARCHAR(100),
    old_price DECIMAL(10,2),
    new_price DECIMAL(10,2),
    old_is_premium TINYINT(1),
    new_is_premium TINYINT(1),
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Appointments_Audit (
    audit_id INT(11) AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT(11) NOT NULL,
    action_type ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    old_staff_id INT(11),
    new_staff_id INT(11),
    old_appointment_date DATE,
    new_appointment_date DATE,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DELIMITER $$
CREATE TRIGGER trg_staff_before_insert
BEFORE INSERT ON Staff
FOR EACH ROW
BEGIN
    IF NEW.salary < 0 THEN  
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Salary cannot be negative';
    END IF;
    
    IF NEW.hire_date > CURDATE() THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Hire date cannot be in the future';
    END IF;
    
    IF NEW.email IS NOT NULL THEN
        SET NEW.email = LOWER(TRIM(NEW.email));
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_staff_after_insert
AFTER INSERT ON Staff
FOR EACH ROW
BEGIN
    INSERT INTO Staff_Audit (staff_id, action_type, new_full_name, new_role, new_salary, changed_by)
    VALUES (NEW.staff_id, 'INSERT', NEW.full_name, NEW.role, NEW.salary, USER());
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_staff_before_update
BEFORE UPDATE ON Staff
FOR EACH ROW
BEGIN
    IF NEW.salary < 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Salary cannot be negative';
    END IF;
    
    IF NEW.email IS NOT NULL THEN
        SET NEW.email = LOWER(TRIM(NEW.email));
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_staff_after_update
AFTER UPDATE ON Staff
FOR EACH ROW
BEGIN
    INSERT INTO Staff_Audit (
        staff_id, action_type, 
        old_full_name, new_full_name,
        old_role, new_role,
        old_salary, new_salary,
        changed_by
    )
    VALUES (
        NEW.staff_id, 'UPDATE',
        OLD.full_name, NEW.full_name,
        OLD.role, NEW.role,
        OLD.salary, NEW.salary,
        USER()
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_staff_after_delete
AFTER DELETE ON Staff
FOR EACH ROW
BEGIN
    INSERT INTO Staff_Audit (staff_id, action_type, old_full_name, old_role, old_salary, changed_by)
    VALUES (OLD.staff_id, 'DELETE', OLD.full_name, OLD.role, OLD.salary, USER());
END$$
DELIMITER ;


DELIMITER $$
CREATE TRIGGER trg_services_before_insert
BEFORE INSERT ON Services
FOR EACH ROW
BEGIN
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Service price must be greater than 0';
    END IF;
    
    IF NEW.duration_minutes <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Service duration must be greater than 0 minutes';
    END IF;
    
    IF NEW.is_premium IS NULL THEN
        SET NEW.is_premium = 0;
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_services_after_insert
AFTER INSERT ON Services
FOR EACH ROW
BEGIN
    INSERT INTO Services_Audit (
        service_id, action_type, 
        new_service_name, new_price, new_is_premium,
        changed_by
    )
    VALUES (
        NEW.service_id, 'INSERT',
        NEW.service_name, NEW.price, NEW.is_premium,
        USER()
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_services_before_update
BEFORE UPDATE ON Services
FOR EACH ROW
BEGIN
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Service price must be greater than 0';
    END IF;
    
    IF NEW.duration_minutes <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Service duration must be greater than 0 minutes';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_services_after_update
AFTER UPDATE ON Services
FOR EACH ROW
BEGIN
    INSERT INTO Services_Audit (
        service_id, action_type,
        old_service_name, new_service_name,
        old_price, new_price,
        old_is_premium, new_is_premium,
        changed_by
    )
    VALUES (
        NEW.service_id, 'UPDATE',
        OLD.service_name, NEW.service_name,
        OLD.price, NEW.price,
        OLD.is_premium, NEW.is_premium,
        USER()
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_services_after_delete
AFTER DELETE ON Services
FOR EACH ROW
BEGIN
    INSERT INTO Services_Audit (
        service_id, action_type,
        old_service_name, old_price, old_is_premium,
        changed_by
    )
    VALUES (
        OLD.service_id, 'DELETE',
        OLD.service_name, OLD.price, OLD.is_premium,
        USER()
    );
END$$
DELIMITER ;


DELIMITER $$
CREATE TRIGGER trg_customers_before_insert
BEFORE INSERT ON Customers
FOR EACH ROW
BEGIN
    IF NEW.email IS NOT NULL THEN
        SET NEW.email = LOWER(TRIM(NEW.email));
    END IF;
    
    IF NEW.full_name IS NOT NULL THEN
        SET NEW.full_name = TRIM(NEW.full_name);
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_customers_before_update
BEFORE UPDATE ON Customers
FOR EACH ROW
BEGIN
    IF NEW.email IS NOT NULL THEN
        SET NEW.email = LOWER(TRIM(NEW.email));
    END IF;
    
    IF NEW.full_name IS NOT NULL THEN
        SET NEW.full_name = TRIM(NEW.full_name);
    END IF;
END$$
DELIMITER ;


DELIMITER $$
CREATE TRIGGER trg_appointments_before_insert
BEFORE INSERT ON Appointments
FOR EACH ROW
BEGIN
    IF NEW.appointment_date < CURDATE() THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Appointment date cannot be in the past';
    END IF;
    
    IF NEW.status IS NULL OR NEW.status = '' THEN
        SET NEW.status = 'Scheduled';
    END IF;
    
    IF NEW.status NOT IN ('Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No-Show') THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid appointment status';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_appointments_after_insert
AFTER INSERT ON Appointments
FOR EACH ROW
BEGIN
    INSERT INTO Appointments_Audit (
        appointment_id, action_type,
        new_status, new_staff_id, new_appointment_date,
        changed_by
    )
    VALUES (
        NEW.appointment_id, 'INSERT',
        NEW.status, NEW.staff_id, NEW.appointment_date,
        USER()
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_appointments_before_update
BEFORE UPDATE ON Appointments
FOR EACH ROW
BEGIN
    IF NEW.appointment_date < CURDATE() AND OLD.appointment_date >= CURDATE() THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot move appointment to a past date';
    END IF;
    
    IF NEW.status NOT IN ('Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No-Show') THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid appointment status';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_appointments_after_update
AFTER UPDATE ON Appointments
FOR EACH ROW
BEGIN
    INSERT INTO Appointments_Audit (
        appointment_id, action_type,
        old_status, new_status,
        old_staff_id, new_staff_id,
        old_appointment_date, new_appointment_date,
        changed_by
    )
    VALUES (
        NEW.appointment_id, 'UPDATE',
        OLD.status, NEW.status,
        OLD.staff_id, NEW.staff_id,
        OLD.appointment_date, NEW.appointment_date,
        USER()
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_appointments_after_delete
AFTER DELETE ON Appointments
FOR EACH ROW
BEGIN
    INSERT INTO Appointments_Audit (
        appointment_id, action_type,
        old_status, old_staff_id, old_appointment_date,
        changed_by
    )
    VALUES (
        OLD.appointment_id, 'DELETE',
        OLD.status, OLD.staff_id, OLD.appointment_date,
        USER()
    );
END$$
DELIMITER ;


DELIMITER $$
CREATE TRIGGER trg_messages_before_insert
BEFORE INSERT ON Messages
FOR EACH ROW
BEGIN
    IF NEW.email IS NOT NULL THEN
        SET NEW.email = LOWER(TRIM(NEW.email));
    END IF;
    
    IF NEW.name IS NOT NULL THEN
        SET NEW.name = TRIM(NEW.name);
    END IF;
    
    IF NEW.subject IS NOT NULL THEN
        SET NEW.subject = TRIM(NEW.subject);
    END IF;
END$$
DELIMITER ;


DELIMITER $$
CREATE TRIGGER trg_admins_before_insert
BEFORE INSERT ON Admins
FOR EACH ROW
BEGIN
    SET NEW.username = TRIM(NEW.username);
    
    IF LENGTH(NEW.username) < 3 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Username must be at least 3 characters long';
    END IF;
    
    IF NEW.password_hash IS NULL OR LENGTH(NEW.password_hash) < 10 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid password hash';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER trg_admins_before_delete
BEFORE DELETE ON Admins
FOR EACH ROW
BEGIN
    DECLARE admin_count INT;
    
    SELECT COUNT(*) INTO admin_count FROM Admins;
    
    IF admin_count <= 1 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot delete the last admin account';
    END IF;
END$$
DELIMITER ;