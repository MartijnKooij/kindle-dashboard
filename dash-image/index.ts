import * as googleCalendarApi from "@googleapis/calendar";
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DateTime } from 'luxon';
import * as fs from "fs";
import { PNG } from "pngjs";
import * as https from 'https';
import jsdom from "jsdom";
const { JSDOM } = jsdom;

const keys = {
  client_email: process.env.client_email,
  private_key: process.env.private_key.replace(/\\n/g, "\n"),
};

const calendarIdValues = process.env.calendar_ids.split(";");
const footballEventId = 'football';

class DashboardImageGenerator {
  getCalendarIds() {
    return [
      {
        id: calendarIdValues[0],
        name: "Martijn",
        isGoogleCalendar: true
      },
      {
        id: calendarIdValues[1],
        name: "Elja",
        isGoogleCalendar: true
      },
      {
        id: calendarIdValues[2],
        name: "Leanne",
        isGoogleCalendar: true
      },
      {
        id: calendarIdValues[3],
        name: "Familie",
        isGoogleCalendar: true
      },
      {
        id: footballEventId,
        name: "Voetbal",
        isGoogleCalendar: false
      },
    ];
  }

  async generateImage() {
    const footballEvent: CalendarEntry = await this.getFootballEvent();
    let events = await this.getCalendarData();

    if (footballEvent) {
      events.push(footballEvent);
      events = events
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .slice(0, 6); // Return the next 6 events
    }

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
    const blackAndWhite = PNG.sync.write(png, { colorType: 0 });

    const client = new S3Client({
      region: 'eu-west-1'
    });

    const command = new PutObjectCommand({
      Bucket: "kindle-dashboard.martijnkooij.nl",
      Key: "dashboard.png",
      Body: blackAndWhite,
      ContentType: 'image/png'
    });

    try {
      await client.send(command);
      return 'SUCCESS';
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  private async takeSnapshot(outputHtml: string): Promise<string> {
    const client = new LambdaClient({
      region: 'eu-west-1'
    });

    const command = new InvokeCommand({
      FunctionName: 'browser-snapshots',
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
      ])
    });

    const { Payload } = await client.send(command);
    const result = Buffer.from(Payload).toString();
    return JSON.parse(result)[0].outputData
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
          this.getCalendarIds().filter(c => c.isGoogleCalendar).map((c) =>
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

  private async getFootballEvent(): Promise<CalendarEntry> {
    try {
      const url = process.env.FOOTBALL_EVENT_URL;
      if (!url) {
        throw new Error('FOOTBALL_EVENT_URL environment variable is not set');
      }
      const htmlData = await this.getUrlContents(url);
      const htmlDocument = new JSDOM(htmlData);
      const XPathResultANY_TYPE = 0;
      const headings = htmlDocument.window.document.evaluate("//h4[contains(., 'Programma')]", htmlDocument.window.document, null, XPathResultANY_TYPE, null);
      const programHeading = headings.iterateNext();
      const programContainer = programHeading.parentNode.parentNode.parentNode;
      const programTable = programContainer.querySelectorAll('table tr');
      const nextMatch = programTable[1].querySelectorAll('td');
      const matchLabel = nextMatch[2].textContent.replace(/ MO15-[\d]/g, '');

      return {
        start: this.parseDutchDate(nextMatch[0].textContent),
        calendarId: footballEventId,
        summary: matchLabel + (matchLabel.startsWith('DEV') ? ' (THUIS)' : ' (UIT)')
      } as CalendarEntry;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  private async getUrlContents(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = ''

      https.get(url, res => {
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          resolve(data);
        });
        res.on('error', (e) => reject(e));
      });
    });
  }

  private parseDutchDate(dutchDateStr): Date {
    const monthMapping = {
      jan: 1, feb: 2, mrt: 3, apr: 4, mei: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12
    };
    const [day, monthStr, timeStr] = dutchDateStr.split(' ');
    const [hour, minute] = timeStr.split(':').map(Number);
    const month = monthMapping[monthStr.toLowerCase().replace('.', '')];

    const dutchDateTime = DateTime.fromObject({
      year: new Date().getFullYear(),
      day,
      month,
      hour,
      minute
    }, {
      zone: 'Europe/Amsterdam', // Specify the Dutch time zone
    });

    return dutchDateTime.toJSDate();
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
