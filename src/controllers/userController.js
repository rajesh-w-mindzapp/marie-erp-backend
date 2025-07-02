const db = require('../config/db');
const logger = require('../config/logger');

exports.getUserProfile = async (req, res) => {
    try {
        const { userId } = req.query;

        logger.info('Get user profile requested', {
            userId,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        if (!userId) {
            logger.warn('Get user profile failed - missing userId', { ip: req.ip });
            return res.status(400).json({ message: 'User ID is required' });
        }

        const [userProfile] = await db.query(
            `SELECT 
         u.id,
         u.business_name,
         u.email,
         u.plan,
         u.plan_end_date
       FROM users u
       WHERE u.id = ?`,
            [userId]
        );

        if (userProfile.length === 0) {
            logger.warn('Get user profile failed - user not found', { userId, ip: req.ip });
            return res.status(404).json({ message: 'User not found' });
        }

        const profile = userProfile[0];
        logger.info('User profile retrieved successfully', {
            userId,
            businessName: profile.business_name,
            email: profile.email,
            plan: profile.plan,
            planEndDate: profile.plan_end_date,
            ip: req.ip
        });

        res.json({
            id: profile.id,
            business_name: profile.business_name,
            email: profile.email,
            plan: profile.plan,
            plan_end_date: profile.plan_end_date
        });
    } catch (error) {
        logger.error('Unexpected error in getUserProfile', {
            error: error.message,
            userId: req.query?.userId,
            ip: req.ip,
            stack: error.stack
        });
        res.status(500).json({ message: 'Error fetching user profile' });
    }
};