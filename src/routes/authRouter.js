const express = require('express');
const authRouter = express.Router();
const authController = require('../controllers/authController');

authRouter.post('/login', authController.login);
authRouter.post('/register', authController.register);
authRouter.post("/send-otp", authController.sendOtp);
authRouter.post("/otpverify", authController.verifyOtp);
authRouter.post("/update-password", authController.updatePassword);
authRouter.post('/email-verification',authController.emailverify);
authRouter.get('/users',authController.getAllUsers);
authRouter.put('/update-permit/:userId/:permit', authController.updateUserPermission);
authRouter.put('/update-plan-date/:userId', authController.updatePlanEndDate);
module.exports = authRouter;