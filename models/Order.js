const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  customer: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true }
  },
  restaurant: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true }
  },
  items: [{
    productId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    total: { type: Number, required: true }
  }],
  totalAmount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'preparing', 'ready', 'delivered', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'online'],
    required: true
  },
  notes: { type: String },
  estimatedDeliveryTime: { type: Number, default: 30 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Clean up any problematic indexes on startup
orderSchema.statics.cleanupIndexes = async function() {
  try {
    await this.collection.dropIndex('orderId_1');
    console.log('Dropped problematic orderId_1 index');
  } catch (error) {
    if (error.code !== 27) { // Index not found error is OK
      console.log('Index cleanup:', error.message);
    }
  }
};

module.exports = mongoose.model('Order', orderSchema);