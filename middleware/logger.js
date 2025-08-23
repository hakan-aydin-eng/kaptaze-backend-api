/**
 * Request Logger Middleware
 */

const logger = (req, res, next) => {
    const start = Date.now();
    
    // Log request
    console.log(`📍 ${req.method} ${req.originalUrl} - ${req.ip} - ${new Date().toISOString()}`);
    
    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(...args) {
        const duration = Date.now() - start;
        const status = res.statusCode;
        
        // Color code based on status
        let statusColor = '✅'; // Default green
        if (status >= 400 && status < 500) statusColor = '⚠️'; // Yellow for client errors
        if (status >= 500) statusColor = '❌'; // Red for server errors
        
        console.log(`${statusColor} ${req.method} ${req.originalUrl} - ${status} - ${duration}ms`);
        
        originalEnd.apply(this, args);
    };
    
    next();
};

module.exports = logger;