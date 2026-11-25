# Test della versione con PIN — SA.DIT

## Build

Apri **Actions → Windows prototype** e scarica `SA.DIT-Windows-amd64-prototype` dall'ultima esecuzione **riuscita**. Estrai e avvia `SA.DIT.exe` su Windows 11.

## Due istanze sullo stesso PC

1. Avvia due copie dell'eseguibile. Scegli **Interprete** nella prima e **Sala** nella seconda.
2. In **Interprete** premi **Condividi finestra e ottieni PIN** e seleziona una finestra diversa da SA.DIT.
3. In **Sala** scegli il microfono e inserisci il PIN. Premi **Connettiti**.
4. Verifica che la chat funzioni in entrambe le direzioni.
5. Verifica che la finestra di proiezione si apra **separatamente**, mostri il contenuto condiviso e sia ridimensionabile.
6. Verifica che l'interprete riceva l'audio. Sullo stesso PC sono consigliate cuffie per evitare feedback.
7. Verifica che la dialog Setup conservi le impostazioni e che la barra di stato e il log mostrino problemi leggibili.

## Due PC

Ripeti su due macchine, ciascuna con una sola istanza. La configurazione PeerJS/STUN deve essere compatibile su entrambi. Per reti con NAT/firewall restrittivi configura un server TURN.

## Limiti della versione sperimentale

- Il PIN di sei cifre identifica direttamente un peer e non è una credenziale sicura.
- La connessione si appoggia a PeerJS. L'uso del server pubblico può essere limitato dalla sua disponibilità.
- Per cambiare microfono durante la sessione occorre disconnettersi.
- Non sono ancora previsti registrazione, sottotitoli testuali, chat persistente o ripristino automatico.
- Anche una build riuscita non dimostra che i due flussi WebRTC funzionino su tutti i PC: servono test reali.

## Segnalazione problemi

Riporta il risultato di questi test: apertura dell'app, scelta ruolo, acquisizione finestra, PIN, chat, audio, finestra di proiezione, eventuali messaggi di errore nel log e versione del sistema operativo.
