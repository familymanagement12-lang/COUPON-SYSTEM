const { query } = require('../config/database');
const logger = require('../utils/logger');
const Vendor = require('../models/Vendor');
const ResponseHandler = require('../utils/response');

const register = async (req, res) => {
    try {
        const { userId, vendorName, vendorType, shopLocation, contactPerson } = req.body;

        if (!userId || !vendorName) {
            return ResponseHandler.badRequest(res, 'userId and vendorName are required.');
        }

        const existingVendor = await Vendor.findByUserId(userId);
        if (existingVendor) {
            return ResponseHandler.badRequest(res, 'Vendor already exists for this user.');
        }

        const vendor = await Vendor.create({
            userId,
            vendorName,
            vendorType,
            shopLocation,
            contactPerson
        });

        return ResponseHandler.created(res, 'Vendor registered successfully.', { vendor });
    } catch (error) {
        logger.error('Vendor registration error:', error);
        return ResponseHandler.serverError(res, 'Failed to register vendor.');
    }
};

const getVendor = async (req, res) => {
    try {
        const vendor = await Vendor.findById(req.params.vendorId);
        if (!vendor) {
            return ResponseHandler.notFound(res, 'Vendor not found.');
        }

        return ResponseHandler.success(res, 'Vendor retrieved successfully.', { vendor });
    } catch (error) {
        logger.error('Get vendor error:', error);
        return ResponseHandler.serverError(res, 'Failed to retrieve vendor.');
    }
};

const getSummary = async (req, res) => {
    const vendorId = parseInt(req.params.vendorId, 10);

    if (req.user.role !== 'admin' && req.user.vendorId !== vendorId) {
        return ResponseHandler.forbidden(res, 'You can only view your own vendor summary.');
    }

    try {
        const result = await query(
            `SELECT
                COUNT(*)::int AS completed_sales,
                COALESCE(SUM(p.amount), 0)::numeric AS total_earnings,
                COALESCE(SUM(p.amount) FILTER (WHERE p.created_at >= CURRENT_DATE), 0)::numeric AS today_earnings,
                COUNT(*) FILTER (WHERE p.created_at >= CURRENT_DATE)::int AS today_sales,
                COALESCE(AVG(p.amount), 0)::numeric AS average_sale
             FROM purchases p
             JOIN wallet_transactions wt ON wt.id = p.transaction_id
             WHERE p.vendor_id = $1
               AND p.status = 'completed'
               AND wt.status = 'completed'`,
            [vendorId]
        );

        return ResponseHandler.success(res, 'Vendor summary retrieved successfully.', {
            completedSales: result.rows[0].completed_sales,
            totalEarnings: result.rows[0].total_earnings,
            todayEarnings: result.rows[0].today_earnings,
            todaySales: result.rows[0].today_sales,
            averageSale: result.rows[0].average_sale
        });
    } catch (error) {
        logger.error('Get vendor summary error:', error);
        return ResponseHandler.serverError(res, 'Failed to retrieve vendor summary.');
    }
};

/**
 * @desc    Get transaction history for a specific vendor
 * @route   GET /api/vendors/:vendorId/transactions
 * @access  Private (Vendor, Admin)
 */
const getTransactions = async (req, res) => {
    const { vendorId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // Authorization check: Ensure the logged-in user is the vendor or an admin.
    // Note: The JWT payload should contain `vendorId` for vendor users.
    if (req.user.role !== 'admin' && req.user.vendorId !== parseInt(vendorId, 10)) {
        logger.warn(`Forbidden attempt to access vendor transactions. User: ${req.user.id}, Target Vendor: ${vendorId}`);
        return res.status(403).json({
            status: 'error',
            message: 'Forbidden. You can only view your own transactions.'
        });
    }

    try {
        // This query joins purchases with wallet_transactions and students
        // to fetch a comprehensive list of transactions for the vendor.
        const getTransactionsQuery = `
            SELECT
                wt.transaction_id,
                p.amount,
                wt.type,
                wt.description,
                wt.status,
                wt.created_at,
                p.items_description,
                s.student_id AS student_identifier,
                CONCAT(s.first_name, ' ', s.last_name) AS student_name
            FROM purchases p
            JOIN wallet_transactions wt ON p.transaction_id = wt.id
            JOIN students s ON p.student_id = s.id
            WHERE p.vendor_id = $1
            ORDER BY wt.created_at DESC
            LIMIT $2 OFFSET $3;
        `;

        const countQuery = `SELECT COUNT(*) FROM purchases WHERE vendor_id = $1;`;

        const [transactionsResult, countResult] = await Promise.all([
            query(getTransactionsQuery, [vendorId, limit, offset]),
            query(countQuery, [vendorId])
        ]);

        const transactions = transactionsResult.rows;
        const total = parseInt(countResult.rows[0].count, 10);

        res.status(200).json({
            status: 'success',
            message: 'Vendor transactions retrieved successfully.',
            data: {
                transactions,
                pagination: {
                    total,
                    limit: parseInt(limit, 10),
                    offset: parseInt(offset, 10),
                    hasMore: (parseInt(offset, 10) + transactions.length) < total
                }
            }
        });
    } catch (error) {
        logger.error('Get vendor transactions error:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching vendor transactions.'
        });
    }
};

module.exports = { register, getVendor, getSummary, getTransactions };
