import * as googleapis from 'googleapis';
import * as fs from 'fs';

const keys = {
  client_email: process.env.client_email,
  private_key: process.env.private_key.replace(/\\n/g, '\n')
};

const calendarIdValues = process.env.calendar_ids.split(';');

class DashboardImageGenerator {
  get calendarIds() {
    return [
      {
        id: calendarIdValues[0],
        name: 'Martijn'
      },
      {
        id: calendarIdValues[1],
        name: 'Elja'
      },
      {
        id: calendarIdValues[2],
        name: 'Leanne'
      },
      {
        id: calendarIdValues[3],
        name: 'Familie'
      }
    ];
  }

  async generateImage() {
    const events = await this.getCalendarData();
    const template = fs.readFileSync('./template.html').toString();

    const groupedEvents = this.groupEvents(events);

    const eventsHtml = [];
    groupedEvents.forEach(group => {
      eventsHtml.push(`<h2>${group.date}</h2>`);
      group.events.forEach(event => {
        const time = `${event.start.getHours().toString().padStart(2, '0')}:${event.start.getMinutes().toString().padStart(2, '0')}`;
        const name = this.calendarIds.find(c => c.id === event.calendarId).name;
        eventsHtml.push(`<div class='event owner-${name.toLowerCase()}'><span class='title'>${time} - ${event.summary}</span><span class='subtitle'>${name}</span></div>`);
      });
    });

    const output = template.replace('%%calendar_events%%', eventsHtml.join('\n'));

    fs.writeFileSync('./events.html', output);
  }

  groupEvents(events) {
    const groups = events.reduce((groups, event) => {
      const options = { weekday: 'long', month: 'long', day: 'numeric' };
      const date = event.start.toLocaleDateString('nl-NL', options);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(event);
      return groups;
    }, {});

    const groupArrays = Object.keys(groups).map((date) => {
      return {
        date,
        events: groups[date]
      };
    });

    return groupArrays;
  }

  async getCalendarData() {
    const auth = new googleapis.google.auth.JWT({
      email: keys.client_email,
      key: keys.private_key,
      scopes: 'https://www.googleapis.com/auth/calendar.readonly'
    });

    const calendar = googleapis.google.calendar({ version: 'v3', auth });
    const upcomingEvents = [].concat.apply(
      [],
      await Promise.all(
        this.calendarIds.map((c) => this.getEventsForCalendar(calendar, c.id))
      )
    )
      .sort((a, b) => a.start - b.start)
      .filter((a) => (a.start.getTime() - Date.now()) / (3600 * 1000 * 24) <= 4);

    return upcomingEvents;
  }

  async getEventsForCalendar(calendar, calendarId) {
    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: (new Date()).toISOString(),
      maxResults: 5,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items;
    if (events.length) {
      return events.map((event) => {
        const start = new Date(Date.parse(event.start.dateTime || event.start.date));

        return {
          start: start,
          calendarId: calendarId,
          summary: event.summary
        };
      });
    } else {
      return [];
    }
  }
}

const generator = new DashboardImageGenerator();

generator.generateImage();
