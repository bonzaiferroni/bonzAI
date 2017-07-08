export class Notifier {

    public static exceptionCount: number;
    public static exceptionIdentifiers: {[identifier: string]: number};

    public static log(message: string) {
        console.log(message);
        Memory.notifier.push({time: Game.time, earthTime: this.earthTime(-7), message: message});
    }

    public static review(limit = Number.MAX_VALUE, burnAfterReading = false) {
        let messageCount = Memory.notifier.length;

        let count = 0;
        for (let value of Memory.notifier) {
            let secondsElapsed = (Game.time - value.time) * 3;
            let hours = Math.floor(secondsElapsed / 3600);
            secondsElapsed -= hours * 3600;
            let minutes = Math.floor(secondsElapsed / 60);
            secondsElapsed -= minutes * 60;
            let seconds = secondsElapsed;
            console.log(`${value.earthTime} tick: ${value.time} (roughly ${
                hours > 0 ? `${hours} hours, ` : ""}${
                minutes > 0 ? `${minutes} minutes, ` : ""}${
                seconds > 0 ? `${seconds} seconds ` : ""}ago)`);
            console.log(`${value.message}`);
            count++;
            if (count >= limit) { break; }
        }

        let destroyed = 0;
        if (burnAfterReading) {
            while (Memory.notifier.length > 0) {
                Memory.notifier.shift();
                destroyed++;
                if (destroyed >= limit) { break; }
            }
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

    public static finalize() {
        if (this.exceptionCount > 0) {
            console.log(`NOTIFIER: ${this.exceptionCount} total exceptions this tick`);
            console.log(JSON.stringify(this.exceptionIdentifiers));
        }

        this.exceptionCount = 0;
        this.exceptionIdentifiers = {};
    }
}

global.notifier = Notifier;
