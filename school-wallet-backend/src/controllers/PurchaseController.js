const { getClient } = require('../config/database');
const SpendingControlService = require('../services/SpendingControlService');
const logger = require('../utils/logger');

/**
 * @desc    Process a purchase from a student's wallet
 * @route   POST /api/purchases
 * @access  Private (Vendor, Admin)
 */
const processPurchase = async (req, res) => {
    const { studentIdentifier, itemsDescription } = req.body;
    const purchaseAmount = Number.parseFloat(req.body.amount);
    const requestedVendorId = Number.parseInt(req.body.vendorId, 10);
    const vendorId = req.user.role === 'admin' ? requestedVendorId : req.user.vendorId;
    const processingUserId = req.user.id;

    if (!Number.isInteger(vendorId) || vendorId <= 0) {
        return res.status(403).json({
            status: 'error',
            message: 'A valid vendor account is required to process a purchase.'
        });
    }

    if (!studentIdentifier || !Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
        return res.status(400).json({
            status: 'error',
            message: 'Student identifier and a valid amount are required.'
        });
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // 1. Find student and their wallet, and lock the rows to prevent race conditions
        const studentWalletQuery = `
            SELECT s.id as student_id, w.id as wallet_id, w.balance, w.status
            FROM students s
            JOIN wallets w ON s.id = w.student_id
            WHERE s.student_id = $1
            FOR UPDATE;
        `;
        const studentWalletResult = await client.query(studentWalletQuery, [studentIdentifier]);

        if (studentWalletResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Student not found.' });
        }

        const { student_id, wallet_id, balance, status } = studentWalletResult.rows[0];

        // 2. Perform checks
        if (status === 'frozen') {
            await client.query('ROLLBACK');
            return res.status(403).json({ status: 'error', message: 'Wallet is frozen.' });
        }

        if (Number(balance) < purchaseAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Insufficient balance.' });
        }

        try {
            await SpendingControlService.checkLimits(student_id, wallet_id, purchaseAmount);
        } catch (limitError) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: limitError.message });
        }

        // 3. Debit the wallet
        const newBalance = Number(balance) - purchaseAmount;
        await client.query('UPDATE wallets SET balance = $1 WHERE id = $2', [newBalance, wallet_id]);

        // 4. Create a wallet_transaction record
        const transactionDescription = `Purchase of ${itemsDescription || 'items'} from vendor.`;
        const transactionReference = `PUR${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const transactionInsertQuery = `
            INSERT INTO wallet_transactions (transaction_id, wallet_id, student_id, amount, type, description, status)
            VALUES ($1, $2, $3, $4, 'purchase', $5, 'completed')
            RETURNING id;
        `;
        const transactionResult = await client.query(transactionInsertQuery, [transactionReference, wallet_id, student_id, purchaseAmount, transactionDescription]);
        const newTransactionId = transactionResult.rows[0].id;

        // 5. Create a purchase record
        const purchaseInsertQuery = `
            INSERT INTO purchases (student_id, vendor_id, transaction_id, amount, items_description)
            VALUES ($1, $2, $3, $4, $5);
        `;
        await client.query(purchaseInsertQuery, [student_id, vendorId, newTransactionId, purchaseAmount, itemsDescription]);

        // 6. Commit the transaction
        await client.query('COMMIT');

        logger.info(`Purchase successful for student ${studentIdentifier} by vendor ${vendorId}. Amount: ${purchaseAmount}`);

        res.status(201).json({
            status: 'success',
            message: 'Purchase processed successfully.',
            data: {
                transactionId: newTransactionId,
                studentIdentifier,
                newBalance
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error processing purchase:', error);
        res.status(500).json({
            status: 'error',
            message: 'An internal error occurred during the purchase process.'
        });
    } finally {
        client.release();
    }
};

module.exports = { processPurchase };
