const {HomebridgePluginUiServer} = require('@homebridge/plugin-ui-utils');

// your class MUST extend the HomebridgePluginUiServer
class PluginUiServer extends HomebridgePluginUiServer {
    constructor() {
        // super must be called first
        super();

        // Example: create api endpoint request handlers (example only)
        this.onRequest('/hello', this.handleHelloRequest.bind(this));

        // this.ready() must be called to let the UI know you are ready to accept api calls
        this.ready();
    }

    /**
     * Example only.
     * Handle requests made from the UI to the `/hello` endpoint.
     */
    async handleHelloRequest(payload) {
        return ({hello: 'world'});
    }
}

// start the instance of the class
function startPluginUiServer() {
    return new PluginUiServer();
}

startPluginUiServer();
