require('dotenv').config();
const { getPool } = require('./config/database');
const Order = require('./models/Order');

async function debugOrder() {
    try {
        const orderId = '01fe2c35-b0a9-458e-a00b-faedfc604f18';

        console.log('--- Debugging Order Status ---');
        const [orders] = await getPool().execute('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (orders.length === 0) {
            console.error('Order not found!');
            return;
        }

        // Use the model to check logic
        const orderModel = new Order(orders[0]);

        console.log('Order Details:', {
            id: orderModel.id,
            status: orderModel.status,
            createdAt: orderModel.createdAt,
            expiresAt: orderModel.expiresAt,
            now: new Date()
        });

        console.log('isExpired?', orderModel.isExpired());
        console.log('canVerify?', orderModel.canVerify());

        // Explicit comparison
        const now = new Date();
        const expires = new Date(orderModel.expiresAt);
        console.log(`Now: ${now.toISOString()} vs Expires: ${expires.toISOString()}`);
        console.log(`Diff (min): ${(expires - now) / 1000 / 60}`);

    } catch (error) {
        console.error('Debug Error:', error);
    } finally {
        process.exit();
    }
}

debugOrder();
