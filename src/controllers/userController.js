const db = require('../config/db');

exports.getUserProfile = async (req, res) => {
    try {
        const userId = req.query.userId;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const [userProfile] = await db.promise().query(
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
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            id: userProfile[0].id,
            business_name: userProfile[0].business_name,
            email: userProfile[0].email,
            plan: userProfile[0].plan,
            plan_end_date: userProfile[0].plan_end_date
        });

    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Error fetching user profile' });
    }
}; 