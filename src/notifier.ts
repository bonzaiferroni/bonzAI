export class Notifier {

    private static exceptionCount: number;
    private static exceptionIdentifiers: {[identifier: string]: number} = {};
    private static messages: {[roomName: string]: string[]};

    public static log(message: string, severity = 5) {
        let styles = {
            [0]: () => console.log(message),
            [1]: () => console.log(`<font color="#00FF00" severity="1">${message}</font>`),
            [2]: () => console.log(`<font color="#00FFFF" severity="2">${message}</font>`),
            [3]: () => console.log(`<font color="#FFFF00" severity="3" type="highlight">${message}</font>`),
            [4]: () => console.log(`<font color="#FF00FF" severity="4">${message}</font>`),
            [5]: () => console.log(`<font color="#FF0000" severity="4">${message}</font>`),
        };
        if (styles[severity]) {
            styles[severity]();
        }
        if (severity === 5) {
            Memory.notifier.push({time: Game.time, earthTime: this.earthTime(-7), message: message});
        }
        while (Memory.notifier.length > 1000) {
            Memory.notifier.shift();
        }
    }

    public static review(substr?: string) {
        let messageCount = Memory.notifier.length;

        let count = 0;
        for (let value of Memory.notifier) {
            let secondsElapsed = (Game.time - value.time) * 3;
            let hours = Math.floor(secondsElapsed / 3600);
            secondsElapsed -= hours * 3600;
            let minutes = Math.floor(secondsElapsed / 60);
            secondsElapsed -= minutes * 60;
            let seconds = secondsElapsed;
            if (!substr || value.message.indexOf(substr) >= 0) {
                console.log(`${value.earthTime} tick: ${value.time} (roughly ${
                    hours > 0 ? `${hours} hours, ` : ""}${
                    minutes > 0 ? `${minutes} minutes, ` : ""}${
                    seconds > 0 ? `${seconds} seconds ` : ""}ago)`);
                console.log(`${value.message}`);
            }
            count++;
        }

        return `viewing ${count} of ${messageCount} notifications`;
    }

    public static clear(term: string) {
        if (term) {
            let initialCount = Memory.notifier.length;
            term = term.toLocaleLowerCase();
            let newArray = [];
            for (let value of Memory.notifier) {
                try {
                    if (value.message.toLocaleLowerCase().indexOf(term) < 0) {
                        newArray.push(value);
                    }
                } catch (e) {

                }
            }
            Memory.notifier = newArray;

            return `removed ${initialCount - Memory.notifier.length} messages;`;
        } else {
            let count = Memory.notifier.length;
            Memory.notifier = [];
            return `removed ${count} messages;`;
        }
    }

    public static earthTime(timeZoneOffset: number): string {
        let date = new Date();
        let hours = date.getHours() + timeZoneOffset; // my timezone offset
        if (hours < 0) { hours += 24; }
        return `${hours}:${date.getMinutes() > 9 ? date.getMinutes() : "0" + date.getMinutes()}:${
            date.getSeconds() > 9 ? date.getSeconds() : "0" + date.getSeconds() }`;
    }

    public static reportException(e: any, phaseName: string, identifier?: string) {

        if (this.exceptionCount === 0) {
            console.log(`NOTIFIER: error caught in ${phaseName} phase for ${identifier}`);
            console.log(e.stack);
        }

        if (this.exceptionIdentifiers[identifier] === undefined) {
            this.exceptionIdentifiers[identifier] = 0;
        }

        this.exceptionIdentifiers[identifier]++;
        this.exceptionCount++;
    }

    public static update() {
        this.messages = {};
        this.exceptionCount = 0;
        this.exceptionIdentifiers = {};
    }

    public static finalize() {
        if (this.exceptionCount > 0) {
            console.log(`NOTIFIER: ${this.exceptionCount} total exceptions this tick`);
            console.log(JSON.stringify(this.exceptionIdentifiers));
        }

        this.displayMessages();
    }

    public static addMessage(roomName: string, message: string) {
        if (!this.messages[roomName]) {
            this.messages[roomName] = [];
        }
        this.messages[roomName].push(message);
    }

    private static displayMessages() {
        for (let roomName in this.messages) {
            let messages = this.messages[roomName];
            let x = 0;
            let y = .5;
            for (let message of messages) {
                new RoomVisual(roomName).text(message, x, y, {color: "white", font: "bold .4 monospace", align: "left"});
                y += .5;
            }
        }
    }
}

global.notifier = Notifier;
