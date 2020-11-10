const net=require("net");
const tls = require("tls");

class Http2TLSTunnel {
    constructor(listenPort, tlsHost, listenHost = "0.0.0.0") {
        this._listenHost = listenHost;
        this._listenPort = listenPort;
        this._targetHost = tlsHost;
    }

    get listenPort() { return this._listenPort; }
    get targetHost() { return this._targetHost; }
    get listenHost() { return this._listenHost; }
    get server() { return this._server; }
    async start() {

        if (this.server && this.server.listening) return this.server;
        if (this.tlsSocket && this.tlsSocket) {
            try {
                this.tlsSocket.end();
            }
            catch {}
        }
        const connectionListener = (tcpSocket) => {
            this.tcpSocket = tcpSocket;
            console.debug("client connected from %s:%d", tcpSocket.remoteAddress, tcpSocket.remotePort);
            console.log(`conencting to: ${this.targetHost}`);

            const tlsOptions = {host: this.targetHost, rejectUnauthorized: false, port:443, timeout: 1000, checkServerIdentity: () => {}}
            //servername: this.targetHost,

            const tlsSocket = tls.connect(tlsOptions);
            tlsSocket.on('secureConnect', function() {
                console.debug("connect to %s:%d success", tlsSocket.remoteAddress, tlsSocket.remotePort);
                tcpSocket.pipe(tlsSocket);
                tlsSocket.pipe(tcpSocket);
            })

            tlsSocket.on("error",  (error) => {
                console.error(error);
                tcpSocket.write("HTTP/1.1 503 service unavailable\r\n\r\n");
                tcpSocket.end();
            });

            tcpSocket.on("error",  (error) => {
                console.debug(error);
                tlsSocket.end();
            });
            tlsSocket.on("close",  (hadError) => {
                tcpSocket.end();
            });
            this.tlsSocket = tlsSocket;
        }

        this._server = net.createServer(connectionListener);

        this._server.listen(this.listenPort, this.listenHost, () => {
            const addr = this._server.address();
            console.debug("listening on %s:%d", addr.address, addr.port);
        });
    }

    async stop() {
        if (this.tcpSocket) {
            try {
                this.tcpSocket.end();
            }
            catch {}
        }
        if (this.tlsSocket) {
            try {
                this.tlsSocket.end();
            }
            catch {}
        }

        if (this._server && this._server.listening) {
            try {
                this._server.close();
            } catch {
            }
        }
    }
}

module.exports = {Http2TLSTunnel}