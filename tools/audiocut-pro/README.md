# ✂️ AudioCut Pro

> Corte de áudios em lote — rápido e simples, 100% no navegador.

Ferramenta para cortar múltiplos arquivos de áudio e exportar como MP3,
direto no navegador. Sem upload, sem servidor — tudo processado localmente.

---

## 🚀 Como usar

1. Abra o arquivo [`AudioCut-Pro.html`](./AudioCut-Pro.html) no navegador (duplo clique)
2. Arraste seus áudios para a zona de upload (ou clique para selecionar)
3. Ajuste os pontos de **início** e **fim** na waveform
4. Clique em **Exportar Todos** para baixar os cortes em MP3

Formatos suportados na entrada: **MP3, WAV, OGG, FLAC, AAC, M4A**

---

## ✨ Recursos

- 📦 Processamento em lote — vários arquivos de uma vez
- 🎯 Seleção visual na waveform com handles arrastáveis
- 🎵 Exportação em MP3 (LAME via [lamejs](https://github.com/zhuker/lamejs))
- 🔒 100% local — nenhum arquivo sai do seu computador

---

## 📁 Arquivos

| Arquivo | O que faz |
|---|---|
| `AudioCut-Pro.html` | Aplicação (HTML + JS) |
| `style.css` | Estilos visuais — separado pra ficar fácil de mexer |

---

## 📝 Notas

- Requer navegador moderno (Chrome, Edge, Firefox recentes)
- Arquivos grandes podem demorar para decodificar — a waveform é gerada sob demanda
