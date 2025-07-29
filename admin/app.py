import os
import uuid
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import tempfile
from werkzeug.utils import secure_filename

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration from environment variables
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
SUPABASE_BUCKET = os.getenv('SUPABASE_BUCKET', 'post-images')

# Check if required environment variables are set
if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing required environment variables SUPABASE_URL and SUPABASE_KEY")
    print("Please set these in your Render environment variables")
    exit(1)

# Initialize Supabase client
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Error connecting to Supabase: {e}")
    print("Please check your SUPABASE_URL and SUPABASE_KEY environment variables")
    exit(1)

# Allowed file extensions for images
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def upload_image_to_supabase(file, post_id):
    """Upload image to Supabase Storage and return public URL"""
    try:
        # Generate unique filename
        file_extension = file.filename.rsplit('.', 1)[1].lower()
        filename = f"{post_id}_{uuid.uuid4().hex}.{file_extension}"
        
        # Read file data
        file_data = file.read()
        
        # Upload to Supabase Storage
        result = supabase.storage.from_(SUPABASE_BUCKET).upload(
            filename, 
            file_data,
            file_options={
                "content-type": file.content_type
            }
        )
        
        if result.error:
            raise Exception(f"Upload failed: {result.error}")
        
        # Get public URL
        public_url = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(filename)
        return public_url
        
    except Exception as e:
        print(f"Image upload error: {str(e)}")
        raise e

def delete_image_from_supabase(image_url):
    """Delete image from Supabase Storage"""
    try:
        if not image_url:
            return
        
        # Extract filename from URL
        filename = image_url.split('/')[-1]
        
        # Delete from storage
        result = supabase.storage.from_(SUPABASE_BUCKET).remove([filename])
        
        if result.error:
            print(f"Failed to delete image: {result.error}")
    
    except Exception as e:
        print(f"Image deletion error: {str(e)}")

@app.route('/api/posts', methods=['GET'])
def get_posts():
    """Get all posts"""
    try:
        result = supabase.table('posts').select('*').order('created_at', desc=True).execute()
        
        if result.error:
            return jsonify({'error': result.error}), 500
        
        return jsonify(result.data)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/posts', methods=['POST'])
def create_post():
    """Create a new post"""
    try:
        # Get form data
        post_id = request.form.get('post_id')
        platform = request.form.get('platform')
        country = request.form.get('country')
        status = request.form.get('status', 'Available')
        
        # Validate required fields
        if not all([post_id, platform, country]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Check if post_id already exists
        existing = supabase.table('posts').select('id').eq('post_id', post_id).execute()
        if existing.data:
            return jsonify({'error': 'Post ID already exists'}), 400
        
        # Handle image upload
        image_url = None
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename != '' and allowed_file(file.filename):
                try:
                    image_url = upload_image_to_supabase(file, post_id)
                except Exception as e:
                    return jsonify({'error': f'Image upload failed: {str(e)}'}), 500
        
        # Create post data
        post_data = {
            'post_id': post_id,
            'platform': platform,
            'country': country,
            'status': status,
            'image_url': image_url,
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Insert into database
        result = supabase.table('posts').insert(post_data).execute()
        
        if result.error:
            # If database insert fails, delete uploaded image
            if image_url:
                delete_image_from_supabase(image_url)
            return jsonify({'error': result.error}), 500
        
        return jsonify(result.data[0]), 201
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/posts/<int:post_id>', methods=['PUT'])
def update_post(post_id):
    """Update an existing post"""
    try:
        # Get existing post
        existing_result = supabase.table('posts').select('*').eq('id', post_id).execute()
        
        if not existing_result.data:
            return jsonify({'error': 'Post not found'}), 404
        
        existing_post = existing_result.data[0]
        
        # Get form data
        post_id_value = request.form.get('post_id', existing_post['post_id'])
        platform = request.form.get('platform', existing_post['platform'])
        country = request.form.get('country', existing_post['country'])
        status = request.form.get('status', existing_post['status'])
        
        # Handle image upload
        image_url = existing_post['image_url']
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename != '' and allowed_file(file.filename):
                try:
                    # Delete old image if exists
                    if existing_post['image_url']:
                        delete_image_from_supabase(existing_post['image_url'])
                    
                    # Upload new image
                    image_url = upload_image_to_supabase(file, post_id_value)
                except Exception as e:
                    return jsonify({'error': f'Image upload failed: {str(e)}'}), 500
        
        # Update post data
        update_data = {
            'post_id': post_id_value,
            'platform': platform,
            'country': country,
            'status': status,
            'image_url': image_url,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Update in database
        result = supabase.table('posts').update(update_data).eq('id', post_id).execute()
        
        if result.error:
            return jsonify({'error': result.error}), 500
        
        return jsonify(result.data[0])
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/posts/<int:post_id>', methods=['DELETE'])
def delete_post(post_id):
    """Delete a post"""
    try:
        # Get existing post to get image URL
        existing_result = supabase.table('posts').select('*').eq('id', post_id).execute()
        
        if not existing_result.data:
            return jsonify({'error': 'Post not found'}), 404
        
        existing_post = existing_result.data[0]
        
        # Delete from database
        result = supabase.table('posts').delete().eq('id', post_id).execute()
        
        if result.error:
            return jsonify({'error': result.error}), 500
        
        # Delete image if exists
        if existing_post['image_url']:
            delete_image_from_supabase(existing_post['image_url'])
        
        return jsonify({'message': 'Post deleted successfully'})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Ensure the storage bucket exists
    try:
        buckets = supabase.storage.list_buckets()
        bucket_names = [bucket.name for bucket in buckets]
        
        if SUPABASE_BUCKET not in bucket_names:
            print(f"Creating storage bucket: {SUPABASE_BUCKET}")
            supabase.storage.create_bucket(SUPABASE_BUCKET, {
                "public": True
            })
    except Exception as e:
        print(f"Storage bucket setup error: {e}")
    
    # Run the application
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)