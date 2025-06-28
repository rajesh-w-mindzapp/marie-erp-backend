const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const nodemailer = require("nodemailer")
const logger = require('../config/logger');

const transporter = nodemailer.createTransport({
    service: 'gmail', // or any other SMTP service you're using
    auth: {
        user: process.env.USER_EMAIL, // your email
        pass: process.env.USER_PASS, // your email password or app-specific password
    },
});

exports.emailverify= async(req, res)=>{
    try {
        const { email, otp } = req.body;
        
        logger.info('Email verification requested', {
            email: email,
            hasOtp: !!otp,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        if (!email || !otp) {
            logger.warn('Email verification failed - missing required fields', {
                email: email,
                hasOtp: !!otp,
                ip: req.ip
            });
            return res.status(400).json({ success: false, message: 'Email and OTP are required' });
        }
    
        // Email options
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: email,
          subject: 'Your Verification Code',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
              <h2 style="color: #333;">Verification Code</h2>
              <p style="font-size: 16px; color: #555;">Please use the following code to verify your account:</p>
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
                <h1 style="margin: 0; color: #333; letter-spacing: 5px;">${otp}</h1>
              </div>
              <p style="font-size: 14px; color: #777;">This code will expire in 10 minutes for security reasons.</p>
              <p style="font-size: 14px; color: #777;">If you didn't request this code, please ignore this email.</p>
            </div>
          `
        };
    
        // Send email
        await transporter.sendMail(mailOptions);
        
        logger.info('Email verification OTP sent successfully', {
            email: email,
            ip: req.ip
        });
        
        return res.status(200).json({ 
          success: true, 
          message: 'OTP sent successfully'
        });
      } catch (error) {
        logger.error('Error sending email verification', {
            error: error.message,
            email: email,
            ip: req.ip,
            stack: error.stack
        });
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to send OTP email',
          error: error.message
        });
      }
}

exports.login = (req, res) => {
    const { email, password } = req.body;

    logger.info('Login attempt', {
        email: email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            logger.error('Database error during login', {
                error: err.message,
                email: email,
                ip: req.ip,
                stack: err.stack
            });
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            logger.warn('Login failed - user not found', {
                email: email,
                ip: req.ip
            });
            return res.status(404).json({ error: 'User not found' });
        }

        const user = results[0];

        if (!user.permitted) {
            logger.warn('Login failed - user not permitted', {
                email: email,
                userId: user.id,
                ip: req.ip
            });
            return res.status(403).json({ error: 'User not permitted yet' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            logger.warn('Login failed - invalid password', {
                email: email,
                userId: user.id,
                ip: req.ip
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        logger.info('Password verification successful', {
            email: email,
            userId: user.id,
            ip: req.ip
        });

        // Generate JWT token with 1 month expiration
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                business_name: user.business_name,
                plan: user.plan,
                country: user.country
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '30d' } // 30 days expiration
        );

        logger.info('User login successful', {
            email: email,
            userId: user.id,
            businessName: user.business_name,
            plan: user.plan,
            country: user.country,
            ip: req.ip
        });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                business_name: user.business_name,
                email: user.email,
                plan: user.plan,
                country: user.country,
            }
        });
    });
};
exports.updateUserPermission = (req, res) => {
    const { userId, permit } = req.params; // Get both from params
    
    logger.info('User permission update requested', {
        userId: userId,
        permit: permit,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    // Convert permit to number since URL params are strings
    const permitValue = parseInt(permit);
    
    // Validate input
    if (!userId) {
        logger.warn('User permission update failed - missing userId', {
            permit: permit,
            ip: req.ip
        });
        return res.status(400).json({
            error: 'User ID is required'
        });
    }
    
    if (permitValue !== 0 && permitValue !== 1) {
        logger.warn('User permission update failed - invalid permit value', {
            userId: userId,
            permit: permit,
            permitValue: permitValue,
            ip: req.ip
        });
        return res.status(400).json({
            error: 'Permit value must be 0 or 1'
        });
    }
    
    // Update the user's permission status
    const query = 'UPDATE users SET permitted = ? WHERE id = ?';
   
    db.query(query, [permitValue, userId], (err, result) => {
        if (err) {
            logger.error('Database error updating user permission', {
                error: err.message,
                userId: userId,
                permitValue: permitValue,
                ip: req.ip,
                stack: err.stack
            });
            return res.status(500).json({
                error: 'Database error',
                message: 'Failed to update user permission'
            });
        }
        
        if (result.affectedRows === 0) {
            logger.warn('User permission update failed - user not found', {
                userId: userId,
                permitValue: permitValue,
                ip: req.ip
            });
            return res.status(404).json({
                error: 'User not found'
            });
        }
        
        logger.info('User permission updated successfully', {
            userId: userId,
            permitValue: permitValue,
            ip: req.ip
        });
        
        res.json({
            success: true,
            message: `Permission ${permitValue ? 'granted' : 'revoked'} successfully`,
            userId: userId,
            permit: permitValue
        });
    });
};
// Controller function
exports.updatePlanEndDate = (req, res) => {
    const { userId } = req.params;
    const { plan_end_date } = req.body;
    
    logger.info('Plan end date update requested', {
        userId: userId,
        planEndDate: plan_end_date,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    // Validate input
    if (!userId) {
        logger.warn('Plan end date update failed - missing userId', {
            planEndDate: plan_end_date,
            ip: req.ip
        });
        return res.status(400).json({
            error: 'User ID is required'
        });
    }
    
    if (!plan_end_date) {
        logger.warn('Plan end date update failed - missing plan_end_date', {
            userId: userId,
            ip: req.ip
        });
        return res.status(400).json({
            error: 'Plan end date is required'
        });
    }
    
    // Validate date format (optional - you might want to add more robust date validation)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(plan_end_date)) {
        logger.warn('Plan end date update failed - invalid date format', {
            userId: userId,
            planEndDate: plan_end_date,
            ip: req.ip
        });
        return res.status(400).json({
            error: 'Invalid date format. Expected YYYY-MM-DD'
        });
    }
    
    // Update the user's plan end date
    const query = 'UPDATE users SET plan_end_date = ? WHERE id = ?';
   
    db.query(query, [plan_end_date, userId], (err, result) => {
        if (err) {
            logger.error('Database error updating plan end date', {
                error: err.message,
                userId: userId,
                planEndDate: plan_end_date,
                ip: req.ip,
                stack: err.stack
            });
            return res.status(500).json({
                error: 'Database error',
                message: 'Failed to update plan end date'
            });
        }
        
        if (result.affectedRows === 0) {
            logger.warn('Plan end date update failed - user not found', {
                userId: userId,
                planEndDate: plan_end_date,
                ip: req.ip
            });
            return res.status(404).json({
                error: 'User not found'
            });
        }
        
        logger.info('Plan end date updated successfully', {
            userId: userId,
            planEndDate: plan_end_date,
            ip: req.ip
        });
        
        res.json({
            success: true,
            message: 'Plan end date updated successfully',
            userId: userId,
            plan_end_date: plan_end_date
        });
    });
};


exports.getAllUsers = (req, res) => {
    logger.info('Get all users requested', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    const query = `
        SELECT 
            id,
            business_name AS name,
            email,
            permitted AS permit,
            plan_end_date
        FROM users 
        ORDER BY business_name ASC
    `;

    db.query(query, (err, results) => {
        if (err) {
            logger.error('Database error retrieving all users', {
                error: err.message,
                ip: req.ip,
                stack: err.stack
            });
            return res.status(500).json({ 
                error: 'Database error',
                message: 'Failed to retrieve users'
            });
        }

        const users = results.map(user => ({
            id: user.id.toString(),
            name: user.name || user.email.split('@')[0],
            email: user.email,
            permit: user.permit ? 1 : 0,
            plan_end_date: user.plan_end_date 
                ? new Date(user.plan_end_date).toISOString().split('T')[0] // e.g. '2025-06-05'
                : null
        }));

        logger.info('All users retrieved successfully', {
            userCount: users.length,
            ip: req.ip
        });

        res.json({
            success: true,
            users: users,
            count: users.length
        });
    });
};

exports.register = async (req, res) => {
    const {
        selectedPlan,
        barcodeOption,
        password,
        businessDetails
    } = req.body;

    logger.info('User registration requested', {
        selectedPlan: selectedPlan,
        barcodeOption: barcodeOption,
        businessName: businessDetails?.businessName,
        businessType: businessDetails?.businessType,
        country: businessDetails?.country,
        email: businessDetails?.email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    if (!businessDetails) {
        logger.warn('Registration failed - missing business details', {
            ip: req.ip
        });
        return res.status(400).json({ message: 'Missing business details' });
    }

    const {
        businessName,
        businessType,
        country,
        businessAddress,
        email,
        whatsapp
    } = businessDetails;

    try {
        const [existing] = await db.promise().query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (existing.length > 0) {
            logger.warn('Registration failed - email already exists', {
                email: email,
                ip: req.ip
            });
            return res.status(400).json({ message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Convert values to match ENUMs
        const plan = selectedPlan.toLowerCase(); // e.g., 'Stock' -> 'stock'
        const printer = barcodeOption.toLowerCase() === 'yes'; // 'yes' => true

        // Insert the new user
        const result = await db.promise().query(
            `INSERT INTO users (
          business_name, business_type, country, address,
          email, whatsapp, plan, printer, password_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                businessName,
                businessType.toLowerCase().trim(),
                country.toLowerCase(),
                businessAddress,
                email,
                whatsapp,
                plan,
                printer,
                hashedPassword
            ]
        );

        const userId = result[0].insertId;

        logger.info('User registration successful', {
            userId: userId,
            email: email,
            businessName: businessName,
            plan: plan,
            country: country,
            ip: req.ip
        });

        res.status(201).json({
            message: 'Registration successful',
            userId: userId // Return the inserted user ID
        });
    } catch (err) {
        logger.error('Registration error', {
            error: err.message,
            email: email,
            businessName: businessName,
            ip: req.ip,
            stack: err.stack
        });
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Send OTP
exports.sendOtp = (req, res) => {
    const { email } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP

    logger.info('OTP send requested', {
        email: email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Get user by email
    db.query("SELECT id FROM users WHERE email = ?", [email], (err, userRows) => {
        if (err) {
            logger.error('Database error querying user for OTP', {
                error: err.message,
                email: email,
                ip: req.ip,
                stack: err.stack
            });
            return res.status(500).json({ success: false, message: "Server error" });
        }

        if (userRows.length === 0) {
            logger.warn('OTP send failed - user not found', {
                email: email,
                ip: req.ip
            });
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const userId = userRows[0].id;

        // Insert OTP into otps table
        db.query("INSERT INTO otps (user_id, email, otp) VALUES (?, ?, ?)", [userId, email, otp], (err, result) => {
            if (err) {
                logger.error('Database error inserting OTP', {
                    error: err.message,
                    email: email,
                    userId: userId,
                    ip: req.ip,
                    stack: err.stack
                });
                return res.status(500).json({ success: false, message: "Failed to store OTP" });
            }

            // Send OTP via email
            transporter.sendMail({
                from: process.env.USER_EMAIL,
                to: email,
                subject: "OTP Verification - Marie ERP",
                text: `Your OTP is ${otp}. It expires in 5 minutes.`,
            }, (err, info) => {
                if (err) {
                    logger.error('Email sending error for OTP', {
                        error: err.message,
                        email: email,
                        userId: userId,
                        ip: req.ip,
                        stack: err.stack
                    });
                    return res.status(500).json({ success: false, message: "Failed to send OTP" });
                }

                logger.info('OTP sent successfully', {
                    email: email,
                    userId: userId,
                    ip: req.ip
                });

                return res.json({ success: true, message: "OTP sent successfully" });
            });
        });
    });
};

// Verify OTP
exports.verifyOtp = (req, res) => {
    const { email, otp } = req.body;

    logger.info('OTP verification requested', {
        email: email,
        hasOtp: !!otp,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    const query = "SELECT * FROM otps WHERE email = ? ORDER BY id DESC LIMIT 1";

    db.query(query, [email], (err, results) => {
        if (err) {
            logger.error('Database error verifying OTP', {
                error: err.message,
                email: email,
                ip: req.ip,
                stack: err.stack
            });
            return res.status(500).json({ success: false, message: "Verification error" });
        }

        const record = results[0];

        if (!record) {
            logger.warn('OTP verification failed - OTP not found', {
                email: email,
                ip: req.ip
            });
            return res.status(400).json({ success: false, message: "OTP not found" });
        }

        if (record.otp != otp) {
            logger.warn('OTP verification failed - invalid OTP', {
                email: email,
                ip: req.ip
            });
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        if (new Date() > new Date(record.expires_at)) {
            logger.warn('OTP verification failed - OTP expired', {
                email: email,
                ip: req.ip
            });
            return res.status(400).json({ success: false, message: "OTP expired" });
        }

        logger.info('OTP verification successful', {
            email: email,
            ip: req.ip
        });

        return res.json({ success: true, message: "OTP verified" });
    });
};

// Controller function to handle password update
exports.updatePassword = async (req, res) => {
    const { email, newPassword, confirmPassword } = req.body;

    logger.info('Password update requested', {
        email: email,
        hasNewPassword: !!newPassword,
        hasConfirmPassword: !!confirmPassword,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    if (!email || !newPassword || !confirmPassword) {
        logger.warn('Password update failed - missing required fields', {
            email: email,
            hasNewPassword: !!newPassword,
            hasConfirmPassword: !!confirmPassword,
            ip: req.ip
        });
        return res.status(400).json({ message: "Email, new password, and confirm password are required." });
    }

    if (newPassword !== confirmPassword) {
        logger.warn('Password update failed - passwords do not match', {
            email: email,
            ip: req.ip
        });
        return res.status(400).json({ message: "Passwords do not match." });
    }

    try {
        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Directly update the user's password
        const query = "UPDATE users SET password_hash = ? WHERE email = ?";
        const [result] = await db.promise().query(query, [hashedPassword, email]);

        if (result.affectedRows > 0) {
            logger.info('Password updated successfully', {
                email: email,
                ip: req.ip
            });
            return res.status(200).json({ message: "Password updated successfully." });
        } else {
            logger.warn('Password update failed - user not found', {
                email: email,
                ip: req.ip
            });
            return res.status(500).json({ message: "Unable to update password." });
        }
    } catch (error) {
        logger.error('Error updating password', {
            error: error.message,
            email: email,
            ip: req.ip,
            stack: error.stack
        });
        return res.status(500).json({ message: "Internal server error." });
    }
};