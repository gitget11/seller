// Configuration - Replace with your actual URLs when deploying
const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://your-api-url.onrender.com';
const SUPABASE_URL = 'https://your-project.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'your-anon-key'; // Replace with your Supabase anon key

// Initialize Supabase client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global variables
let currentUser = null;
let allPosts = [];
let editingPostId = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const adminDashboard = document.getElementById('adminDashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginErrorMessage = document.getElementById('loginErrorMessage');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const addPostBtn = document.getElementById('addPostBtn');
const refreshBtn = document.getElementById('refreshBtn');
const postsTableBody = document.getElementById('postsTableBody');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const errorMessage = document.getElementById('errorMessage');

// Modal elements
const postModal = document.getElementById('postModal');
const deleteModal = document.getElementById('deleteModal');
const modalTitle = document.getElementById('modalTitle');
const postForm = document.getElementById('postForm');
const closeModal = document.getElementById('closeModal');
const cancelBtn = document.getElementById('cancelBtn');
const saveBtn = document.getElementById('saveBtn');

// Stats elements
const totalPosts = document.getElementById('totalPosts');
const availablePosts = document.getElementById('availablePosts');
const onHoldPosts = document.getElementById('onHoldPosts');
const soldPosts = document.getElementById('soldPosts');

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthState();
    setupEventListeners();
});

// Check authentication state
async function checkAuthState() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            showDashboard();
            await loadPosts();
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showLogin();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    loginForm.addEventListener('submit', handleLogin);
    
    // Dashboard actions
    logoutBtn.addEventListener('click', handleLogout);
    addPostBtn.addEventListener('click', () => openPostModal());
    refreshBtn.addEventListener('click', loadPosts);
    
    // Modal actions
    closeModal.addEventListener('click', closePostModal);
    cancelBtn.addEventListener('click', closePostModal);
    postForm.addEventListener('submit', handlePostSubmit);
    
    // Delete modal
    document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
    
    // Close modals on backdrop click
    postModal.addEventListener('click', (e) => {
        if (e.target === postModal) closePostModal();
    });
    
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });
    
    // Auth state changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            showLogin();
        }
    });
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');
    
    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        hideLoginError();
        
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        showDashboard();
        await loadPosts();
        
    } catch (error) {
        console.error('Login error:', error);
        showLoginError(error.message);
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
    }
}

// Handle logout
async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        allPosts = [];
        showLogin();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Show login screen
function showLogin() {
    loginScreen.style.display = 'flex';
    adminDashboard.style.display = 'none';
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    hideLoginError();
}

// Show dashboard
function showDashboard() {
    loginScreen.style.display = 'none';
    adminDashboard.style.display = 'block';
    userEmail.textContent = currentUser?.email || '';
}

// Show/hide login error
function showLoginError(message) {
    loginErrorMessage.textContent = message;
    loginError.style.display = 'block';
}

function hideLoginError() {
    loginError.style.display = 'none';
}

// Load posts from API
async function loadPosts() {
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/posts`, {
            headers: {
                'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const posts = await response.json();
        allPosts = posts;
        
        hideLoading();
        renderPosts(posts);
        updateStats(posts);
        
    } catch (err) {
        console.error('Error loading posts:', err);
        hideLoading();
        showError(`Failed to load posts: ${err.message}`);
    }
}

// Show loading state
function showLoading() {
    loading.style.display = 'block';
    error.style.display = 'none';
    document.getElementById('postsTable').style.display = 'none';
}

// Hide loading state
function hideLoading() {
    loading.style.display = 'none';
    document.getElementById('postsTable').style.display = 'block';
}

// Show error state
function showError(message) {
    error.style.display = 'block';
    errorMessage.textContent = message;
    document.getElementById('postsTable').style.display = 'none';
}

// Render posts in table
function renderPosts(posts) {
    postsTableBody.innerHTML = posts.map(post => createPostRow(post)).join('');
}

// Create post table row
function createPostRow(post) {
    const statusClass = getStatusClass(post.status);
    const formattedDate = new Date(post.created_at).toLocaleDateString();
    
    return `
        <tr>
            <td>
                <img src="${post.image_url || '/api/placeholder/60/60'}" 
                     alt="Post ${post.post_id}" 
                     class="post-image-thumb"
                     onerror="this.src='/api/placeholder/60/60'">
            </td>
            <td><strong>${post.post_id}</strong></td>
            <td>${post.platform}</td>
            <td>${getCountryFlag(post.country)} ${post.country}</td>
            <td><span class="status-badge ${statusClass}">${post.status}</span></td>
            <td>${formattedDate}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn primary" onclick="openPostModal(${post.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn danger" onclick="openDeleteModal(${post.id}, '${post.post_id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Update stats
function updateStats(posts) {
    const stats = posts.reduce((acc, post) => {
        acc.total++;
        switch (post.status.toLowerCase()) {
            case 'available':
                acc.available++;
                break;
            case 'on hold':
                acc.onHold++;
                break;
            case 'sold':
                acc.sold++;
                break;
        }
        return acc;
    }, { total: 0, available: 0, onHold: 0, sold: 0 });
    
    totalPosts.textContent = stats.total;
    availablePosts.textContent = stats.available;
    onHoldPosts.textContent = stats.onHold;
    soldPosts.textContent = stats.sold;
}

// Open post modal for add/edit
function openPostModal(postId = null) {
    editingPostId = postId;
    
    if (postId) {
        // Edit mode
        const post = allPosts.find(p => p.id === postId);
        if (post) {
            modalTitle.textContent = 'Edit Post';
            document.getElementById('postId').value = post.id;
            document.getElementById('postIdInput').value = post.post_id;
            document.getElementById('platform').value = post.platform;
            document.getElementById('country').value = post.country;
            document.getElementById('status').value = post.status;
            
            if (post.image_url) {
                document.getElementById('currentImage').style.display = 'block';
                document.getElementById('currentImagePreview').src = post.image_url;
            } else {
                document.getElementById('currentImage').style.display = 'none';
            }
        }
    } else {
        // Add mode
        modalTitle.textContent = 'Add New Post';
        postForm.reset();
        document.getElementById('currentImage').style.display = 'none';
    }
    
    postModal.style.display = 'flex';
}

// Close post modal
function closePostModal() {
    postModal.style.display = 'none';
    editingPostId = null;
    postForm.reset();
}

// Handle post form submission
async function handlePostSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData();
    const postData = {
        post_id: document.getElementById('postIdInput').value,
        platform: document.getElementById('platform').value,
        country: document.getElementById('country').value,
        status: document.getElementById('status').value
    };
    
    const imageFile = document.getElementById('imageFile').files[0];
    
    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        let endpoint, method;
        if (editingPostId) {
            endpoint = `${API_BASE_URL}/api/posts/${editingPostId}`;
            method = 'PUT';
            formData.append('id', editingPostId);
        } else {
            endpoint = `${API_BASE_URL}/api/posts`;
            method = 'POST';
        }
        
        // Append post data
        Object.keys(postData).forEach(key => {
            formData.append(key, postData[key]);
        });
        
        // Append image if selected
        if (imageFile) {
            formData.append('image', imageFile);
        }
        
        const response = await fetch(endpoint, {
            method,
            headers: {
                'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save post');
        }
        
        closePostModal();
        await loadPosts();
        
    } catch (error) {
        console.error('Save error:', error);
        alert(`Failed to save post: ${error.message}`);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Post';
    }
}

// Open delete confirmation modal
function openDeleteModal(postId, postIdString) {
    editingPostId = postId;
    document.getElementById('deletePostId').textContent = postIdString;
    deleteModal.style.display = 'flex';
}

// Close delete modal
function closeDeleteModal() {
    deleteModal.style.display = 'none';
    editingPostId = null;
}

// Confirm delete
async function confirmDelete() {
    if (!editingPostId) return;
    
    try {
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        
        const response = await fetch(`${API_BASE_URL}/api/posts/${editingPostId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${(await supabaseClient.auth.getSession()).data.session?.access_token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete post');
        }
        
        closeDeleteModal();
        await loadPosts();
        
    } catch (error) {
        console.error('Delete error:', error);
        alert(`Failed to delete post: ${error.message}`);
    } finally {
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
    }
}

// Utility functions
function getStatusClass(status) {
    switch (status.toLowerCase()) {
        case 'available':
            return 'status-available';
        case 'on hold':
            return 'status-on-hold';
        case 'sold':
            return 'status-sold';
        default:
            return 'status-available';
    }
}

function getCountryFlag(countryCode) {
    const flags = {
        'US': '🇺🇸',
        'PK': '🇵🇰',
        'IN': '🇮🇳',
        'UK': '🇬🇧',
        'CA': '🇨🇦'
    };
    return flags[countryCode] || '🌍';
}
