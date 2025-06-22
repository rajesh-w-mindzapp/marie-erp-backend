const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const nodemailer = require("nodemailer")

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
        
        if (!email || !otp) {
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
        
        return res.status(200).json({ 
          success: true, 
          message: 'OTP sent successfully'
        });
      } catch (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to send OTP email',
          error: error.message
        });
      }
}

exports.login = (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        if (results.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = results[0];


        if (!user.permitted) return res.status(403).json({ error: 'User not permitted yet' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        console.log(isMatch);

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
    
    // Convert permit to number since URL params are strings
    const permitValue = parseInt(permit);
    
    // Validate input
    if (!userId) {
        return res.status(400).json({
            error: 'User ID is required'
        });
    }
    
    if (permitValue !== 0 && permitValue !== 1) {
        return res.status(400).json({
            error: 'Permit value must be 0 or 1'
        });
    }
    
    // Update the user's permission status
    const query = 'UPDATE users SET permitted = ? WHERE id = ?';
   
    db.query(query, [permitValue, userId], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({
                error: 'Database error',
                message: 'Failed to update user permission'
            });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        
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
    
    // Validate input
    if (!userId) {
        return res.status(400).json({
            error: 'User ID is required'
        });
    }
    
    if (!plan_end_date) {
        return res.status(400).json({
            error: 'Plan end date is required'
        });
    }
    
    // Validate date format (optional - you might want to add more robust date validation)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(plan_end_date)) {
        return res.status(400).json({
            error: 'Invalid date format. Expected YYYY-MM-DD'
        });
    }
    
    // Update the user's plan end date
    const query = 'UPDATE users SET plan_end_date = ? WHERE id = ?';
   
    db.query(query, [plan_end_date, userId], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({
                error: 'Database error',
                message: 'Failed to update plan end date'
            });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Plan end date updated successfully',
            userId: userId,
            plan_end_date: plan_end_date
        });
    });
};


exports.getAllUsers = (req, res) => {
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
            console.error('Database error:', err);
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

    if (!businessDetails) {
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

        // Log the inserted user id
        console.log("Inserted user with ID:", result[0].insertId);

        res.status(201).json({
            message: 'Registration successful',
            userId: result[0].insertId // Return the inserted user ID
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Send OTP
exports.sendOtp = (req, res) => {
    const { email } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP

    // Get user by email
    db.query("SELECT id FROM users WHERE email = ?", [email], (err, userRows) => {
        if (err) {
            console.error("Error querying user:", err);
            return res.status(500).json({ success: false, message: "Server error" });
        }

        if (userRows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const userId = userRows[0].id;

        // Insert OTP into otps table
        db.query("INSERT INTO otps (user_id, email, otp) VALUES (?, ?, ?)", [userId, email, otp], (err, result) => {
            if (err) {
                console.error("Error inserting OTP:", err);
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
                    console.error("Error sending email:", err);
                    return res.status(500).json({ success: false, message: "Failed to send OTP" });
                }

                return res.json({ success: true, message: "OTP sent successfully" });
            });
        });
    });
};

// Verify OTP
exports.verifyOtp = (req, res) => {
    const { email, otp } = req.body;

    const query = "SELECT * FROM otps WHERE email = ? ORDER BY id DESC LIMIT 1";

    db.query(query, [email], (err, results) => {
        if (err) {
            console.error("DB Error:", err);
            return res.status(500).json({ success: false, message: "Verification error" });
        }

        const record = results[0];

        if (!record) {
            return res.status(400).json({ success: false, message: "OTP not found" });
        }

        if (record.otp != otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        if (new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ success: false, message: "OTP expired" });
        }

        return res.json({ success: true, message: "OTP verified" });
    });
};

// Controller function to handle password update
exports.updatePassword = async (req, res) => {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email || !newPassword || !confirmPassword) {
        return res.status(400).json({ message: "Email, new password, and confirm password are required." });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match." });
    }

    try {
        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Directly update the user's password
        const query = "UPDATE users SET password_hash = ? WHERE email = ?";
        const [result] = await db.promise().query(query, [hashedPassword, email]);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: "Password updated successfully." });
        } else {
            return res.status(500).json({ message: "Unable to update password." });
        }
    } catch (error) {
        console.error("Error updating password:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};