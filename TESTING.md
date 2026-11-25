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

## Regressioni: proiezione e riconnessione

1. Connettiti come Interprete e Sala. Nella Sala verifica la riga di log **Video dell'interprete ricevuto** e poi **La finestra di proiezione ha accettato il collegamento video** / **Proiezione attiva**. Il video deve essere visibile nella finestra separata.
2. Riduci a icona la finestra principale della Sala. La proiezione deve rimanere aperta e utilizzabile, senza bloccare l'interfaccia principale.
3. A sessione attiva, apri la select degli ingressi della Sala e cambia microfono. L'interprete deve continuare a sentire il nuovo ingresso; la chat non deve scollegarsi.
4. Premi **Disconnettiti** e conferma, poi avvia una nuova sessione (nuovo PIN dell'Interprete). Verifica che la chat torni utilizzabile in entrambi i sensi e che audio e proiezione riprendano.
5. Disconnetti prima un lato, poi ripeti invertendo i ruoli. Verifica che nessun vecchio canale PeerJS impedisca il successivo collegamento.

La proiezione usa ora il bus eventi Wails per negoziare un secondo collegamento WebRTC **locale**. I messaggi tecnici nel log distinguono ricezione remota del video, negoziazione e riproduzione nella finestra separata. La build CI verifica compilazione e test Go, non il comportamento dei dispositivi su Windows.

## Diagnostica video (temporanea)

Nella modalità **Sala**, dopo la connessione, compare una piccola anteprima video sopra la scelta del microfono.

- **Se vedi i sottotitoli nell'anteprima**, la tratta WebRTC dall'Interprete alla Sala è funzionante: il problema è nel collegamento con la finestra di proiezione.
- **Se l'anteprima rimane nera**, guarda il log `Diagnostica video remoto`: byte e frame decodificati permettono di capire se i dati arrivano.
- Il log della Sala ora riporta anche `PROBE`, `READY`, offerta SDP, risposta SDP, stato ICE e riproduzione della seconda finestra.
- Se un PIN non esiste, il messaggio PeerJS `peer-unavailable` ripristina il pulsante **Connettiti**, senza dover chiudere l'eseguibile.
- Se la connessione viene chiusa, vengono fermate anche le tracce audio/video e liberati i dispositivi.
- Il titolo della finestra contiene **build N**, dove N è il progressivo `github.run_number`; una build compilata manualmente mostra `dev`.

Per segnalare un difetto di proiezione, copia il log completo della Sala dopo una connessione riuscita e indica se i sottotitoli sono visibili nella piccola anteprima.
