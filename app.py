from flask import Flask, render_template, request, send_file, send_from_directory
import yt_dlp
import os
import tempfile

app = Flask(__name__, template_folder='.', static_folder='.')

@app.route('/')
def index():
    return render_template('index.html')

# CSS나 BGM 파일을 루트 폴더에서 직접 서빙
@app.route('/<path:filename>')
def serve_file(filename):
    return send_from_directory('.', filename)

@app.route('/download', methods=['POST'])
def download():
    url = request.form.get('url')
    if not url: return "URL을 입력해주세요.", 400

    temp_dir = tempfile.gettempdir()
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            file_path = ydl.prepare_filename(info).rsplit('.', 1)[0] + ".mp3"
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        return f"변환 실패: {str(e)}", 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)