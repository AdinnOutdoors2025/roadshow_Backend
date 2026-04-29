const jwt      = require('jsonwebtoken');
const Employee = require('../../Models/Employeelogin/employeelogin');

const JWT_SECRET        = process.env.JWT_SECRET;
const JWT_EXPIRES_IN    = process.env.JWT_EXPIRES_IN    || '7h';
const EMPLOYEE_SECRET   = 'AdinnRdShowAdmin@2025';
const ALLOWED_DOMAIN    = '@adinn.co.in';

// ── Generate JWT ──────────────────────────────────────────────────────────────
const generateToken = (employee) =>
    jwt.sign(
        {
            id:          employee._id,
            employeeId:  employee.employeeId,
            employeeEmail: employee.employeeEmail,
            role:        employee.role,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

// ── Safe employee response object ────────────────────────────────────────────
const buildResponse = (employee) => ({
    id:            employee._id,
    employeeName:  employee.employeeName,
    employeeEmail: employee.employeeEmail,
    employeeId:    employee.employeeId,
    role:          employee.role,
    lastLogin:     employee.lastLogin,
    createdAt:     employee.createdAt,
});

// ─── REGISTER ─────────────────────────────────────────────────────────────────
// POST /api/employee/register

const registerEmployee = async (req, res) => {
    const { employeeName, employeeEmail, secretCode } = req.body;

    try {
        // 1. Required fields
        if (!employeeName || !employeeEmail || !secretCode) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required: employeeName, employeeEmail, secretCode',
            });
        }

        // 2. Validate registration secret
        if (secretCode !== EMPLOYEE_SECRET) {
            return res.status(401).json({
                success: false,
                message: 'INVALID_SECRET_CODE',
            });
        }

        // 3. Validate email domain
        if (!employeeEmail.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
            return res.status(400).json({
                success: false,
                message: `Only ${ALLOWED_DOMAIN} emails are allowed`,
            });
        }

        // 4. Check duplicate
        const existing = await Employee.findOne({ employeeEmail: employeeEmail.toLowerCase() });
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'EMPLOYEE_ALREADY_EXISTS — please login instead',
            });
        }

        // 5. Save — pre-save hook hashes secretCode
        const employee = new Employee({
            employeeName:  employeeName.trim(),
            employeeEmail: employeeEmail.toLowerCase().trim(),
            secretCode,
            employeeId:    `EMP${Date.now()}`,
            role:          'employee',
        });
        await employee.save();

        // 6. Issue JWT
        const token = generateToken(employee);

        return res.status(201).json({
            success:  true,
            message:  'Employee registered successfully',
            token,
            employee: buildResponse(employee),
        });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'EMPLOYEE_ALREADY_EXISTS' });
        }
        console.error('Register error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error during registration' });
    }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
// POST /api/employee/login

const loginEmployee = async (req, res) => {
    const { employeeEmail, secretCode } = req.body;

    try {
        // 1. Required fields
        if (!employeeEmail || !secretCode) {
            return res.status(400).json({
                success: false,
                message: 'employeeEmail and secretCode are required',
            });
        }

        // 2. Validate email domain
        if (!employeeEmail.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
            return res.status(400).json({
                success: false,
                message: `Only ${ALLOWED_DOMAIN} emails are allowed`,
            });
        }

        // 3. Find employee
        const employee = await Employee.findOne({ employeeEmail: employeeEmail.toLowerCase() });
        if (!employee) {
            return res.status(401).json({
                success: false,
                message: 'EMPLOYEE_NOT_FOUND — please register first',
            });
        }

        // 4. Verify secretCode with bcrypt
        const isValid = await employee.compareSecretCode(secretCode);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'INVALID_SECRET_CODE',
            });
        }

        // 5. Update lastLogin
        employee.lastLogin = new Date();
        await employee.save();

        // 6. Issue JWT
        const token = generateToken(employee);

        return res.status(200).json({
            success:  true,
            message:  'Login successful',
            token,
            employee: buildResponse(employee),
        });

    } catch (err) {
        console.error('Login error:', err.message);
        return res.status(500).json({ success: false, message: 'Server error during login' });
    }
};

// ─── GET PROFILE (protected) ──────────────────────────────────────────────────
// GET /api/employee/me

const getEmployeeProfile = (req, res) => {
    // req.employee attached by verifyEmployeeExists middleware
    return res.status(200).json({
        success:  true,
        employee: buildResponse(req.employee),
    });
};

module.exports = { registerEmployee, loginEmployee, getEmployeeProfile };