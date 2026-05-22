document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('toggleSidebar');
    const layoutWrapper = document.querySelector('.layout-wrapper');

    // Sidebar Toggle
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            layoutWrapper.classList.toggle('sidebar-collapsed');
            
            // Save preference to localStorage
            const isCollapsed = layoutWrapper.classList.contains('sidebar-collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed);
        });
    }

    // Restore sidebar state
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState === 'true') {
        layoutWrapper.classList.add('sidebar-collapsed');
    }

    // Avatar Dropdown Toggle
    const avatarDropdown = document.getElementById('avatarDropdown');
    if (avatarDropdown) {
        avatarDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            const parent = avatarDropdown.closest('.dropdown');
            if (parent) {
                const dropdownMenu = parent.querySelector('.dropdown-menu');
                if (dropdownMenu) {
                    dropdownMenu.classList.toggle('show');
                }
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            const parent = avatarDropdown.closest('.dropdown');
            if (parent) {
                const dropdownMenu = parent.querySelector('.dropdown-menu');
                if (dropdownMenu && dropdownMenu.classList.contains('show')) {
                    dropdownMenu.classList.remove('show');
                }
            }
        });
    }

    // Auto dismiss alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 300); // Wait for transition
        }, 5000);
    });
});
