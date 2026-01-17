from flask import Flask, render_template, request, send_file, send_from_directory
import yt_dlp
import os
import tempfile

# 모든 파일이 한 폴더에 있으므로 경로 설정을 현재 폴더(.)로 변경
app = Flask(__name__, template_folder='.', static_folder='.')

@app.route('/')
def index():
    return render_template('index.html')

# 한 폴더에 있는 CSS, JS, MP3 파일을 불러오기 위한 경로 설정
@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

@app.route('/download', methods=['POST'])
def download():
    url = request.form.get('url')
    if not url: return "URL이 없습니다.", 400

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
            # 파일 확장자 처리
            filename = ydl.prepare_filename(info).rsplit('.', 1)[0] + ".mp3"
        return send_file(filename, as_attachment=True)
    except Exception as e:
        return f"오류 발생: {str(e)}", 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)