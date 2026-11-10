# Wheel-of-Demise
[WIP]a Wheel of Demise. ONLY IN ITALIAN

# Ruota della Sfortuna

Una ruota della fortuna personalizzabile, interamente in italiano, che funziona direttamente nel browser: nessun backend, nessuna installazione, nessuna dipendenza.

## Funzionalità

- Aggiunta, modifica e rimozione delle voci (nomi, numeri, parole, caratteri accentati).
- Ruota che si aggiorna automaticamente a ogni modifica.
- Animazione di rotazione con durata casuale.
- Risultato mostrato chiaramente al termine del giro.
- Pulsanti per svuotare la lista e ripristinare lo stato iniziale.
- Le voci vengono salvate nel browser (`localStorage`).
- Layout adatto a desktop e dispositivi mobili.

## Come usarla in locale

Scarica o clona il repository e apri `index.html` con un doppio clic. Non serve nessun server.

```bash
git clone https://github.com/TUO-USERNAME/ruota-della-sfortuna.git
cd ruota-della-sfortuna
```

## Struttura del progetto

| File | Descrizione |
|------|-------------|
| `index.html` | Struttura della pagina |
| `style.css` | Stile e layout responsive |
| `script.js` | Logica dell'applicazione, disegno della ruota e animazione |
| `favicon.svg` | Icona della scheda del browser |
| `.github/workflows/pages.yml` | Pubblicazione automatica su GitHub Pages |

## Pubblicazione su GitHub Pages

1. Nel repository vai su **Settings → Pages**.
2. In **Build and deployment → Source** scegli **GitHub Actions**.
3. A ogni push sul branch `main` il sito viene pubblicato automaticamente.

## Licenza

Distribuito con BSD 2-Clause License. Vedi il file [LICENSE](LICENSE).
