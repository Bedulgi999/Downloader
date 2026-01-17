// 클릭 시 배경음악 재생
document.addEventListener('click', function() {
    const audio = document.getElementById('bgm');
    audio.play().catch(e => console.log("자동재생 차단됨:", e));
}, { once: true });

// 폼 전송 시 상태 표시
document.getElementById('downloadForm').onsubmit = function() {
    document.getElementById('status').style.display = 'block';
};