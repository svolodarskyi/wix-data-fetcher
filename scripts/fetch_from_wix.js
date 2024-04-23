const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pg = require("pg");


const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT;
const DB_DATABASE_NAME = process.env.DB_DATABASE_NAME;
const DB_CERT = process.env.DB_CERT;
const WIX_AUTH_TOKEN = process.env.WIX_AUTH_TOKEN;


// Save data to a JSON file
function saveToJson(data, fileName) {
    const filePath = path.join(__dirname, `${fileName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${fileName}.json`);
}

// Save data to PostgreSQL database
function saveToDatabase(data, tableName) {
    const config = {
        user: DB_USER,
        password: DB_PASSWORD,
        host: DB_HOST,
        port: DB_PORT,
        database: DB_DATABASE_NAME,
        ssl: {
            rejectUnauthorized: true,
            ca: DB_CERT,
        },
    };

    const client = new pg.Client(config);

    client.connect(async function (err) {
        if (err) {
            console.error("Error connecting to database:", err);
            return;
        }

        try {
            // Insert data into the respective table
            if (tableName === 'Orders') {
                for (const order of data) {
                    await client.query(`
                        INSERT INTO Wix.Orders (
                            Id, Number, CreatedDate, UpdatedDate, BuyerEmail,
                            PaymentStatus, FulfillmentStatus, Currency, ShippingAddressLine,
                            ShippingFirstName, ShippingLastName, ShippingPhone, SubtotalAmount,
                            ShippingAmount, TaxAmount, DiscountAmount, TotalPriceAmount, TotalAmount,
                            TotalWithGiftCardAmount, TotalWithoutGiftCardAmount, TotalAdditionalFeesAmount,
                            PaidAmount
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                            $19, $20, $21
                        );
                    `, [
                        order.id, order.number, order.createdDate, order.updatedDate, order.buyerEmail,
                        order.paymentStatus, order.fulfillmentStatus, order.currency, order.shippingAddressLine,
                        order.shippingFirstName, order.shippingLastName, order.shippingPhone, order.subtotalAmount,
                        order.shippingAmount, order.taxAmount, order.discountAmount, order.totalPriceAmount,
                        order.totalAmount, order.totalWithGiftCardAmount, order.totalWithoutGiftCardAmount,
                        order.totalAdditionalFeesAmount, order.paidAmount
                    ]);
                }
            } else if (tableName === 'OrderItems') {
                for (const item of data) {
                    await client.query(`
                        INSERT INTO Wix.OrderItems (
                            OrderId, ProductName, CatalogItemId, Quantity, TotalDiscountAmount,
                            ItemTypePreset, PriceAmount, PriceBeforeDiscountsAmount,
                            TotalPriceBeforeTaxAmount, TotalPriceAfterTaxAmount, PaymentOption,
                            TaxableAmount, TaxRate, TotalTaxAmount, LineItemPriceAmount
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
                        );
                    `, [
                        item.orderId, item.productName, item.catalogItemId, item.quantity, item.totalDiscountAmount,
                        item.itemTypePreset, item.priceAmount, item.priceBeforeDiscountsAmount,
                        item.totalPriceBeforeTaxAmount, item.totalPriceAfterTaxAmount, item.paymentOption,
                        item.taxableAmount, item.taxRate, item.totalTaxAmount, item.lineItemPriceAmount
                    ]);
                }
            }

            console.log(`Data saved to ${tableName} table in database.`);
        } catch (error) {
            console.error(`Error saving data to ${tableName} table:`, error);
        } finally {
            client.end();
        }
    });
}


function parseOrders(data) {
    const orders = data.orders;
    const ordersData = [];
    const lineItemsData = [];

    orders.forEach(order => {
        const orderInfo = {
            id: order.id,
            number: order.number,
            createdDate: order.createdDate,
            updatedDate: order.updatedDate,
            buyerEmail: order.buyerInfo?.email || null,
            paymentStatus: order.paymentStatus || null,
            fulfillmentStatus: order.fulfillmentStatus || null,
            currency: order.currency || null,
            shippingAddressLine: order.shippingInfo?.logistics?.shippingDestination?.address?.addressLine || null,
            shippingFirstName: order.shippingInfo?.logistics?.shippingDestination?.contactDetails?.firstName || null,
            shippingLastName: order.shippingInfo?.logistics?.shippingDestination?.contactDetails?.lastName || null,
            shippingPhone: order.shippingInfo?.logistics?.shippingDestination?.contactDetails?.phone || null,
            subtotalAmount: order?.payNow?.subtotal?.amount || null,
            shippingAmount: order.payNow?.shipping?.amount || null,
            taxAmount: order.payNow?.tax?.amount || null,
            discountAmount: order.payNow?.discount?.amount || null,
            totalPriceAmount: order.payNow?.totalPrice?.amount || null,
            totalAmount: order.payNow?.total?.amount || null,
            totalWithGiftCardAmount: order.payNow?.totalWithGiftCard?.amount || null,
            totalWithoutGiftCardAmount: order.payNow?.totalWithoutGiftCard?.amount || null,
            totalAdditionalFeesAmount: order.payNow?.totalAdditionalFees?.amount || null,
            paidAmount: order.balanceSummary?.paid?.amount || null
        };

        ordersData.push(orderInfo);

        order.lineItems.forEach(item => {
            const lineItem = {
                orderId: order.id,
                productName: item.productName.original || null,
                catalogItemId: item.catalogReference.catalogItemId || null,
                quantity: item.quantity || null,
                totalDiscountAmount: item?.totalDiscount?.amount || null,
                itemTypePreset: item.itemType.preset || null,
                priceAmount: item.price?.amount || null,
                priceBeforeDiscountsAmount: item?.priceBeforeDiscounts?.amount || null,
                totalPriceBeforeTaxAmount: item?.totalPriceBeforeTax?.amount || null,
                totalPriceAfterTaxAmount: item?.totalPriceAfterTax?.amount || null,
                paymentOption: item?.paymentOption || null,
                taxableAmount: item?.taxDetails?.taxableAmount?.amount || null,
                taxRate: item?.taxDetails?.taxRate || null,
                totalTaxAmount: item?.taxDetails?.totalTax?.amount || null,
                lineItemPriceAmount: item?.lineItemPrice?.amount || null
            };

            lineItemsData.push(lineItem);
        });
    });

    return { orders: ordersData, lineItems: lineItemsData };
}


// Fetch orders from API
async function fetchOrders(orders_all = { orders: [], lineItems: [] }, cursor = null, startDate = null, endDate = null) {
    const apiUrl = 'https://www.wixapis.com/ecom/v1/orders/search';
    const requestData = {
        search: {
            cursor_paging: {
                limit: 50
            }
        }
    };

    if (cursor !== null) {
        requestData.search.cursor_paging.cursor = cursor;
    }

    if (startDate !== null && endDate !== null) {
        requestData.search.filter = {
            "$and": [
                {
                    "createdDate": { "$gte": startDate }
                },
                {
                    "createdDate": { "$lte": endDate }
                }
            ]
        };
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': WIX_AUTH_TOKEN  
    };

    try {
        const response = await axios.post(apiUrl, requestData, { headers });
        const data = response.data;

        const { orders, lineItems } = parseOrders(data);
        orders_all.orders.push(...orders);
        orders_all.lineItems.push(...lineItems);

        if (response.data.metadata.hasNext) {
            const nextCursor = response.data.metadata.cursors.next;
            await fetchOrders(orders_all, nextCursor, startDate, endDate);
        } else {
            //const timestamp = new Date().toISOString().replace(/[:\-T.]/g, '');
            //const odersFileName = `orders_${timestamp}`;
            //const oderLineItemsFileName = `order_line_items_${timestamp}`;
            saveToDatabase(orders_all.orders, 'Orders');
            saveToDatabase(orders_all.lineItems, 'LineItems');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

//let startTime = new Date('2024-01-01T00:00:00.000').toISOString();
//let endTime = new Date('2024-05-01T21:00:00.000').toISOString();

fetchOrders(undefined, undefined, undefined, undefined);
