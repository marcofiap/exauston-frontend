const API_URL = "https://wsdggml17l.execute-api.us-east-2.amazonaws.com/exaustor";

// Pega o device_id da URL (exemplo: ?device_id=abc123)
const urlParams = new URLSearchParams(window.location.search);
const DEVICE_ID = urlParams.get("device_id");

let currentStatus = null;
let isLoading = false;

// Elementos DOM
const statusElement = document.getElementById("status");
const statusLight = document.getElementById("statusLight");
const controlButton = document.getElementById("controlButton");
const buttonText = document.getElementById("buttonText");
const fanIcon = document.getElementById("fanIcon");
const deviceInfo = document.getElementById("deviceInfo");

if (!DEVICE_ID) {
    alert("❗ device_id não encontrado na URL");
    statusElement.innerText = "Erro: device_id não encontrado";
    statusLight.className = "status-light error";
    deviceInfo.innerHTML = "❌ Device ID necessário na URL";
} else {
    deviceInfo.innerHTML = `📱 Device: ${DEVICE_ID}`;
}

function updateUI(status, isError = false) {
    if (isError) {
        statusLight.className = "status-light error";
        fanIcon.style.display = "none";
        controlButton.disabled = true;
        buttonText.innerHTML = "❌ Erro de Conexão";
        controlButton.className = "control-button desligar";
        return;
    }
    currentStatus = status;
    controlButton.disabled = false;

    if (status) {
        // Exaustor ligado
        statusLight.className = "status-light on";
        fanIcon.style.display = "inline-block";
        fanIcon.className = "fan-icon spinning";
        controlButton.className = "control-button desligar";
        buttonText.innerHTML = "🔴 Desligar Exaustor";
    } else {
        // Exaustor desligado
        statusLight.className = "status-light off";
        fanIcon.style.display = "none";
        fanIcon.className = "fan-icon";
        controlButton.className = "control-button ligar";
        buttonText.innerHTML = "🔛 Ligar Exaustor";
    }
}

function setLoading(loading) {
    isLoading = loading;
    controlButton.disabled = loading;

    if (loading) {
        statusLight.className = "status-light loading";
        buttonText.innerHTML = '<span class="loading-spinner"></span>Processando...';
        fanIcon.style.display = "none";
    }
}

async function enviarComando(acao) {
    if (isLoading) return;

    setLoading(true);
    const payload = JSON.stringify({
        device_id: DEVICE_ID
    });

    try {
        const response = await fetch(`${API_URL}/${acao}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: payload
        });

        const data = await response.json();

        if (data.success) {
            if (acao === 'ligar' && data.start && data.stop) {
                try {
                    localStorage.setItem(`exaustor_${DEVICE_ID}_start`, data.start);
                    localStorage.setItem(`exaustor_${DEVICE_ID}_stop`, data.stop);
                } catch(e) {
                    console.warn("localStorage indisponível:", e);
                }
            } else if (acao === 'desligar') {
                localStorage.removeItem(`exaustor_${DEVICE_ID}_start`);
                localStorage.removeItem(`exaustor_${DEVICE_ID}_stop`);
            }
            const newStatus = acao === 'ligar';
            statusElement.innerText = `Status: ${newStatus ? 'Ligado' : 'Desligado'}`;
            updateUI(newStatus);
        } else {
            let mensagem = data.msg || "Erro desconhecido";
            if (mensagem.includes(":")) {
                mensagem = mensagem.split(":").slice(1).join(":").trim();
            }
            statusElement.innerText = `Erro: ${mensagem}`;
            updateUI(null, true);
        }
    } catch (error) {
        console.error("Erro de conexão:", error);
        statusElement.innerText = `Erro de conexão`;
        updateUI(null, true);
        localStorage.removeItem(`exaustor_${DEVICE_ID}_start`);
        localStorage.removeItem(`exaustor_${DEVICE_ID}_stop`);
    } finally {
        setLoading(false);
    }
}

async function verificarStatus() {
    try {
        const response = await fetch(`${API_URL}/status?device_id=${DEVICE_ID}&action=status`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();

        if (data.success && data.status) {
            const ligado = data.status.switch_1;
            statusElement.innerText = `Status: ${ligado ? 'Ligado' : 'Desligado'}`;
            updateUI(ligado);
        } else {
            let mensagem = data.msg || "Erro ao verificar status";
            if (mensagem.includes(":")) {
                mensagem = mensagem.split(":").slice(1).join(":").trim();
            }
            statusElement.innerText = `Erro: ${mensagem}`;
            updateUI(null, true);
        }
    } catch (error) {
        console.error("Erro ao verificar status:", error);
        statusElement.innerText = `Erro na comunicação`;
        updateUI(null, true);
    }
}

function atualizarContagemRegressiva() {
    const container = document.getElementById("tempoRestanteContainer");
    const texto     = document.getElementById("tempoRestanteTexto");
    const barra     = document.getElementById("tempoBarraPreenchida");
    if (!container || !texto || !barra) return;

    let stop, start;
    try {
        stop  = localStorage.getItem(`exaustor_${DEVICE_ID}_stop`);
        start = localStorage.getItem(`exaustor_${DEVICE_ID}_start`);
    } catch {
        container.style.display = "none";
        return;
    }

    if (!stop || !start) {
        container.style.display = "none";
        return;
    }

    const stopTime  = new Date(stop).getTime();
    const startTime = new Date(start).getTime();
    if (isNaN(stopTime) || isNaN(startTime)) {
        localStorage.removeItem(`exaustor_${DEVICE_ID}_start`);
        localStorage.removeItem(`exaustor_${DEVICE_ID}_stop`);
        container.style.display = "none";
        return;
    }

    const totalSec    = Math.floor((stopTime - startTime) / 1000);
    const agora       = Date.now();
    const restanteSec = Math.ceil((stopTime - agora) / 1000);

    if (restanteSec > 0) {
        container.style.display = "block";
        texto.innerText   = `Desliga em ${formatTime(restanteSec)}`;
        const percent     = ((totalSec - restanteSec) / totalSec) * 100;
        barra.style.width = `${percent}%`;
    } else {
        localStorage.removeItem(`exaustor_${DEVICE_ID}_start`);
        localStorage.removeItem(`exaustor_${DEVICE_ID}_stop`);
        container.style.display = "none";
        verificarStatus();
    }
}

setInterval(atualizarContagemRegressiva, 1000);

function toggleExaustor() {
    if (isLoading || currentStatus === null) return;

    const acao = currentStatus ? "desligar" : "ligar";
    enviarComando(acao);
}

if (DEVICE_ID) {
    verificarStatus();
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${mm}:${ss}`;
}
