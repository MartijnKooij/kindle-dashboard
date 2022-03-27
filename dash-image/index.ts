import * as googleCalendarApi from "@googleapis/calendar";
import * as fs from "fs";
import * as AWS from "aws-sdk";
import { PNG } from "pngjs";

const keys = {
  client_email: process.env.client_email,
  private_key: process.env.private_key.replace(/\\n/g, "\n"),
};

const calendarIdValues = process.env.calendar_ids.split(";");

class DashboardImageGenerator {
  getCalendarIds() {
    return [
      {
        id: calendarIdValues[0],
        name: "Martijn",
      },
      {
        id: calendarIdValues[1],
        name: "Elja",
      },
      {
        id: calendarIdValues[2],
        name: "Leanne",
      },
      {
        id: calendarIdValues[3],
        name: "Familie",
      },
    ];
  }

  async generateImage() {
    const events = await this.getCalendarData();
    const template = fs.readFileSync("./template.html").toString();

    const groupedEvents = this.groupEvents(events);

    const outputHtml = this.generateHtml(groupedEvents, template);

    if (process.env.debug) {
      fs.writeFileSync('./events.html', outputHtml);

      return Promise.resolve('LOCAL SUCCESS');
    }

    const base64Image = await this.takeSnapshot(outputHtml);
    const pngBytes = Buffer.from(base64Image, 'base64');
    const png = PNG.sync.read(pngBytes);
    const blackAndWhite = PNG.sync.write(png, {colorType: 0});

    const s3 = new AWS.S3();
    const params = {
      Body: blackAndWhite,
      Bucket: "kindle-dashboard.martijnkooij.nl",
      Key: "dashboard.png",
    };
    return new Promise((resolve, reject) =>
      s3.putObject(params, (error, data) => {
        if (error) reject(error);
        else resolve("SUCCESS");
      })
    );
  }

  private takeSnapshot(outputHtml: string): Promise<string> {
    const lambda = new AWS.Lambda({ region: "eu-west-1" });
    const params = {
      FunctionName: "browser-snapshots",
      Payload: JSON.stringify([
        {
          inputType: 0,
          inputData: outputHtml,
          outputType: 0,
          outputOptions: {
            width: 758,
            height: 1024,
            omitBackground: false,
          },
        },
      ]),
    };

    return new Promise((resolve, reject) =>
      lambda.invoke(params, (error, data) => {
        if (error) reject(JSON.stringify(error));
        else resolve(JSON.parse(data.Payload.toString())[0].outputData);
      })
    );
  }

  generateHtml(groupedEvents, template) {
    const eventsHtml = [];
    groupedEvents.forEach((group) => {
      eventsHtml.push(`<h2>${group.date}</h2>`);
      group.events.forEach((event: CalendarEntry) => {
        const localDateTime = event.start.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
        const localTime = localDateTime.split(' ')[1].split(':');
        const time = `${localTime[0].padStart(2, "0")}:${localTime[1].padStart(2, "0")}`;
        const name = this.getCalendarIds().find(
          (c) => c.id === event.calendarId
        ).name;
        eventsHtml.push(
          `<div class='event owner-${name.toLowerCase()}'>
            <div class='details'>
              <span class='title'>${time} - ${event.summary}</span>
              <span class='subtitle'>${name}</span>
            </div>
            <span class='icon'></span>
          </div>`
        );
      });
    });

    const output = template.replace(
      "%%calendar_events%%",
      eventsHtml.join("\n")
    );
    return output;
  }

  groupEvents(events: CalendarEntry[]) {
    const groups = events.reduce((groups, event) => {
      const date = event.start.toLocaleString('nl-NL', {
        timeZone: 'Europe/Amsterdam',
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });

      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(event);
      return groups;
    }, {});

    const groupArrays = Object.keys(groups).map((date) => {
      return {
        date,
        events: groups[date],
      };
    });

    return groupArrays;
  }

  async getCalendarData() {
    const auth = new googleCalendarApi.auth.JWT({
      email: keys.client_email,
      key: keys.private_key,
      scopes: "https://www.googleapis.com/auth/calendar.readonly",
    });

    const calendar = googleCalendarApi.calendar({ version: "v3", auth });
    const upcomingEvents = ([].concat
      .apply(
        [],
        await Promise.all(
          this.getCalendarIds().map((c) =>
            this.getEventsForCalendar(calendar, c.id)
          )
        )
      ) as CalendarEntry[])
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 6); // Return the next 6 events

    return upcomingEvents;
  }

  async getEventsForCalendar(calendar: googleCalendarApi.calendar_v3.Calendar, calendarId: string): Promise<CalendarEntry[]> {
    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: new Date().toISOString(),
      maxResults: 5,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items;
    if (events.length) {
      return events.map((event) => {
        return {
          start: new Date(event.start.dateTime || event.start.date),
          calendarId: calendarId,
          summary: event.summary,
        } as CalendarEntry;
      });
    } else {
      return [];
    }
  }
}

class CalendarEntry {
  start: Date;
  calendarId: string;
  summary: string;
}

export const kindleDashboardImage = async () => {
  const generator = new DashboardImageGenerator();

  return await generator.generateImage();
};
