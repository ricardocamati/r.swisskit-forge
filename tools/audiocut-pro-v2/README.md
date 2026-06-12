# ✂️ AudioCut Pro v2

> Corte de áudios em lote — rápido, preciso e 100% no navegador.

Ferramenta para cortar múltiplos arquivos de áudio e exportar como MP3,
direto no navegador. Sem upload, sem servidor — tudo processado localmente.

---

## 🚀 Como usar

1. Abra o arquivo [`index.html`](./index.html) no navegador (duplo clique)
2. Arraste seus áudios para a zona de upload (ou clique para selecionar)
3. Ajuste os pontos de **início** e **fim** na waveform
   - Arraste as handles coloridas (ciano = início, violeta = fim)
   - Ou use os botões **Início ⟵** / **⟶ Fim** na posição atual
   - Ou edite os campos de tempo manualmente
4. Clique em **Exportar Todos** ou **Este** para baixar o corte em MP3

Formatos suportados na entrada: **MP3, WAV, OGG, FLAC, AAC, M4A, WEBM**

---

## ✨ Novidades do v2

| Recurso | Descrição |
|---|---|
| 🎨 UI Glassmorphism | Tema escuro moderno com efeitos de vidro e néon |
| 🔍 Zoom & Pan | Scroll do mouse para zoom, Ctrl+scroll para pan, ajuste à tela |
| 🌈 Waveform colorida | Amplitude visual: ciano (baixa), verde (média), vermelha (alta) |
| ↩️ Undo / Redo | Histórico de cortes por arquivo (Ctrl+Z / Ctrl+Y) |
| 🔊 Preview do corte | Toca só a região selecionada em loop antes de exportar |
| ☑️ Exportação seletiva | Checkboxes na lista lateral para escolher quais exportar |
| 🏷️ ID3 Tags | Metadados preservados no MP3 (título, artista, comentário com timestamps) |
| ⌨️ Atalhos completos | Todos os comandos com atalhos de teclado (pressione `?` para ver) |
| 📱 Responsivo | Layout adapta para telas menores |

---

## ⌨️ Atalhos

- `Space` — Play/Pause
- `[` — Definir início do corte
- `]` — Definir fim do corte
- `← / →` — Recuar/Avançar 5s
- `Shift + ← / →` — Seek frame a frame (0.01s)
- `C` — Preview do corte em loop
- `Ctrl+S` — Exportar arquivo atual
- `Ctrl+Z` — Desfazer
- `Ctrl+Y` — Refazer
- `Del` — Remover arquivo da fila
- `N / P` — Próximo / Anterior
- `+ / −` — Zoom in / out
- `F` — Ajustar zoom à tela
- `R` — Resetar seleção
- `A` — Adicionar arquivos
- `?` — Mostrar atalhos
- `Esc` — Fechar modal / parar preview

---

## 📁 Arquivos

| Arquivo | O que faz |
|---|---|
| `index.html` | Estrutura da aplicação |
| `app.js` | Lógica completa: áudio, waveform, exportação MP3 |
| `mp3-worker.js` | Web Worker — encode MP3 off-main-thread (arquivos grandes não travam) |
| `style.css` | Estilos visuais — tema glassmorphism dark |

Dependência (CDN): **lamejs** para encode MP3 (carregado no main thread e no worker via importScripts).

---

## 📝 Notas

- Requer navegador moderno (Chrome, Edge, Firefox recentes)
- Arquivos grandes podem demorar para decodificar — a waveform é gerada sob demanda
- O processamento é 100% local — nenhum arquivo sai do seu computador
