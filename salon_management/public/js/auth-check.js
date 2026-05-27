// Auth check for protected pages
function requireAuth() {
    const token = localStorage.getItem('token');
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // Pages that require authentication
    const protectedPages = ['dashboard.html', 'payment.html'];  // REMOVED appointment.html
    
    if (protectedPages.includes(currentPage)) {
        if (!token) {
            // Store the intended destination
            sessionStorage.setItem('redirectAfterLogin', currentPage);
            window.location.href = 'login.html';
            return false;
        }
    }
    return true;
}

// Run on page load
document.addEventListener('DOMContentLoaded', requireAuth);