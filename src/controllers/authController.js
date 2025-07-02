const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { Resend } = require('resend');
const logger = require('../config/logger');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html }) {
    try {
        const info = await resend.emails.send({
            from: process.env.EMAIL_USER,
            to,
            subject,
            html
        });
        return info;
    } catch (err) {
        logger.error('Resend send error', { error: err.message, stack: err.stack });
        throw err;
    }
}

exports.emailverify = async (req, res) => {
    try {
        const { email, otp } = req.body;

        logger.info('Email verification requested', {
            email,
            hasOtp: !!otp,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!email || !otp) {
            logger.warn('Email verification failed - missing required fields', {
                email,
                hasOtp: !!otp,
                ip: req.ip
            });
            return res.status(400).json({ success: false, message: 'Email and OTP are required' });
        }

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

        const info = await sendEmail(mailOptions);
        logger.info('Email verification OTP sent successfully', {
            email,
            ip: req.ip,
            messageId: info.id
        });

        res.status(200).json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        logger.error('Error sending email verification', {
            error: error.message,
            email: req.body?.email,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ success: false, message: 'Failed to send OTP email' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        logger.info('Login attempt', {
            email,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (results.length === 0) {
            logger.warn('Login failed - user not found', { email, ip: req.ip });
            return res.status(404).json({ error: 'User not found' });
        }

        const user = results[0];

        if (!user.permitted) {
            logger.warn('Login failed - user not permitted', {
                email,
                userId: user.id,
                ip: req.ip
            });
            return res.status(403).json({ error: 'User not permitted yet' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            logger.warn('Login failed - invalid password', {
                email,
                userId: user.id,
                ip: req.ip
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        logger.info('Password verification successful', {
            email,
            userId: user.id,
            ip: req.ip
        });

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                business_name: user.business_name,
                plan: user.plan,
                country: user.country
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '30d' }
        );

        logger.info('User login successful', {
            email,
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
                country: user.country
            }
        });
    } catch (error) {
        logger.error('Database error during login', {
            error: error.message,
            email: req.body?.email,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ error: 'Database error' });
    }
};

exports.updateUserPermission = async (req, res) => {
    try {
        const { userId, permit } = req.params;

        logger.info('User permission update requested', {
            userId,
            permit,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const permitValue = parseInt(permit);

        if (!userId) {
            logger.warn('User permission update failed - missing userId', {
                permit,
                ip: req.ip
            });
            return res.status(400).json({ error: 'User ID is required' });
        }

        if (permitValue !== 0 && permitValue !== 1) {
            logger.warn('User permission update failed - invalid permit value', {
                userId,
                permit,
                permitValue,
                ip: req.ip
            });
            return res.status(400).json({ error: 'Permit value must be 0 or 1' });
        }

        const [result] = await db.query('UPDATE users SET permitted = ? WHERE id = ?', [permitValue, userId]);

        if (result.affectedRows === 0) {
            logger.warn('User permission update failed - user not found', {
                userId,
                permitValue,
                ip: req.ip
            });
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info('User permission updated successfully', {
            userId,
            permitValue,
            ip: req.ip
        });

        res.json({
            success: true,
            message: `Permission ${permitValue ? 'granted' : 'revoked'} successfully`,
            userId,
            permit: permitValue
        });
    } catch (error) {
        logger.error('Database error updating user permission', {
            error: error.message,
            userId: req.params?.userId,
            permitValue: req.params?.permit,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ error: 'Database error', message: 'Failed to update user permission' });
    }
};

exports.updatePlanEndDate = async (req, res) => {
    try {
        const { userId } = req.params;
        const { plan_end_date } = req.body;

        logger.info('Plan end date update requested', {
            userId,
            planEndDate: plan_end_date,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!userId) {
            logger.warn('Plan end date update failed - missing userId', {
                planEndDate: plan_end_date,
                ip: req.ip
            });
            return res.status(400).json({ error: 'User ID is required' });
        }

        if (!plan_end_date) {
            logger.warn('Plan end date update failed - missing plan_end_date', {
                userId,
                ip: req.ip
            });
            return res.status(400).json({ error: 'Plan end date is required' });
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(plan_end_date)) {
            logger.warn('Plan end date update failed - invalid date format', {
                userId,
                planEndDate: plan_end_date,
                ip: req.ip
            });
            return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD' });
        }

        const [result] = await db.query('UPDATE users SET plan_end_date = ? WHERE id = ?', [plan_end_date, userId]);

        if (result.affectedRows === 0) {
            logger.warn('Plan end date update failed - user not found', {
                userId,
                planEndDate: plan_end_date,
                ip: req.ip
            });
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info('Plan end date updated successfully', {
            userId,
            planEndDate: plan_end_date,
            ip: req.ip
        });

        res.json({
            success: true,
            message: 'Plan end date updated successfully',
            userId,
            plan_end_date
        });
    } catch (error) {
        logger.error('Database error updating plan end date', {
            error: error.message,
            userId: req.params?.userId,
            planEndDate: req.body?.plan_end_date,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ error: 'Database error', message: 'Failed to update plan end date' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        logger.info('Get all users requested', {
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const [results] = await db.query(
            `SELECT 
         id,
         business_name AS name,
         email,
         permitted AS permit,
         plan_end_date
       FROM users 
       ORDER BY business_name ASC`
        );

        const users = results.map(user => ({
            id: user.id.toString(),
            name: user.name || user.email.split('@')[0],
            email: user.email,
            permit: user.permit ? 1 : 0,
            plan_end_date: user.plan_end_date
                ? new Date(user.plan_end_date).toISOString().split('T')[0]
                : null
        }));

        logger.info('All users retrieved successfully', {
            userCount: users.length,
            ip: req.ip
        });

        res.json({
            success: true,
            users,
            count: users.length
        });
    } catch (error) {
        logger.error('Database error retrieving all users', {
            error: error.message,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ error: 'Database error', message: 'Failed to retrieve users' });
    }
};

exports.register = async (req, res) => {
    try {
        const { selectedPlan, barcodeOption, password, businessDetails } = req.body;

        logger.info('User registration requested', {
            selectedPlan,
            barcodeOption,
            businessName: businessDetails?.businessName,
            businessType: businessDetails?.businessType,
            country: businessDetails?.country,
            email: businessDetails?.email,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!businessDetails) {
            logger.warn('Registration failed - missing business details', { ip: req.ip });
            return res.status(400).json({ message: 'Missing business details' });
        }

        const { businessName, businessType, country, businessAddress, email, whatsapp } = businessDetails;

        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (existing.length > 0) {
            logger.warn('Registration failed - email already exists', { email, ip: req.ip });
            return res.status(400).json({ message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const plan = selectedPlan.toLowerCase();
        const printer = barcodeOption.toLowerCase() === 'yes';

        const [result] = await db.query(
            `INSERT INTO users (
         business_name, business_type, country, address,
         email, whatsapp, plan, printer, password_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [businessName, businessType.toLowerCase().trim(), country.toLowerCase(), businessAddress, email, whatsapp, plan, printer, hashedPassword]
        );

        const userId = result.insertId;

        logger.info('User registration successful', {
            userId,
            email,
            businessName,
            plan,
            country,
            ip: req.ip
        });

        res.status(201).json({ message: 'Registration successful', userId });
    } catch (error) {
        logger.error('Registration error', {
            error: error.message,
            email: req.body?.businessDetails?.email,
            businessName: req.body?.businessDetails?.businessName,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.sendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        logger.info('OTP send requested', {
            email,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const [userRows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);

        if (userRows.length === 0) {
            logger.warn('OTP send failed - user not found', { email, ip: req.ip });
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userId = userRows[0].id;

        await db.query('INSERT INTO otps (user_id, email, otp) VALUES (?, ?, ?)', [userId, email, otp]);

        const info = await sendEmail({
            to: email,
            subject: 'OTP Verification - Marie ERP',
            html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 5 minutes.</p>`
        });

        logger.info('OTP sent successfully via Resend', {
            email,
            userId,
            ip: req.ip,
            messageId: info.id
        });

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        logger.error('Error sending OTP', {
            error: error.message,
            email: req.body?.email,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        logger.info('OTP verification requested', {
            email,
            hasOtp: !!otp,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        const [results] = await db.query('SELECT * FROM otps WHERE email = ? ORDER BY id DESC LIMIT 1', [email]);

        if (results.length === 0) {
            logger.warn('OTP verification failed - OTP not found', { email, ip: req.ip });
            return res.status(400).json({ success: false, message: 'OTP not found' });
        }

        const record = results[0];

        if (record.otp !== otp) {
            logger.warn('OTP verification failed - invalid OTP', { email, ip: req.ip });
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        if (new Date() > new Date(record.expires_at)) {
            logger.warn('OTP verification failed - OTP expired', { email, ip: req.ip });
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        logger.info('OTP verification successful', { email, ip: req.ip });

        res.json({ success: true, message: 'OTP verified' });
    } catch (error) {
        logger.error('Database error verifying OTP', {
            error: error.message,
            email: req.body?.email,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ success: false, message: 'Verification error' });
    }
};

exports.updatePassword = async (req, res) => {
    try {
        const { email, newPassword, confirmPassword } = req.body;

        logger.info('Password update requested', {
            email,
            hasNewPassword: !!newPassword,
            hasConfirmPassword: !!confirmPassword,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!email || !newPassword || !confirmPassword) {
            logger.warn('Password update failed - missing required fields', {
                email,
                hasNewPassword: !!newPassword,
                hasConfirmPassword: !!confirmPassword,
                ip: req.ip
            });
            return res.status(400).json({ message: 'Email, new password, and confirm password are required.' });
        }

        if (newPassword !== confirmPassword) {
            logger.warn('Password update failed - passwords do not match', { email, ip: req.ip });
            return res.status(400).json({ message: 'Passwords do not match.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const [result] = await db.query('UPDATE users SET password_hash = ? WHERE email = ?', [hashedPassword, email]);

        if (result.affectedRows === 0) {
            logger.warn('Password update failed - user not found', { email, ip: req.ip });
            return res.status(404).json({ message: 'User not found.' });
        }

        logger.info('Password updated successfully', { email, ip: req.ip });
        res.status(200).json({ message: 'Password updated successfully.' });
    } catch (error) {
        logger.error('Error updating password', {
            error: error.message,
            email: req.body?.email,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ message: 'Internal server error.' });
    }
};