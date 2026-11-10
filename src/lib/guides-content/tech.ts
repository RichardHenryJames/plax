import type { Guide } from '../guides.ts'

// Technology and programming.
export const TECH_GUIDES: Guide[] = [
  {
    slug: 'how-the-internet-works',
    title: 'How the internet works: from a tap on your phone to a web page',
    topic: 'technology',
    summary:
      'What happens in the second after you open a website: IP addresses, DNS, packets, HTTPS and the cables under the sea, explained without jargon.',
    published: '2026-11-10',
    updated: '2026-11-10',
    related: ['what-is-an-api', 'how-ai-chatbots-and-summaries-work'],
    intro: [
      "You tap a link, and a page appears in a second or less. In that time your request has crossed your mobile network or Wi-Fi, the networks of several companies, perhaps an ocean, and reached a computer that you will never see, which sent back the page in pieces that your phone reassembled.",
      "The internet is not one thing owned by anyone. It is a network of thousands of separate networks that have agreed to pass each other's traffic using common rules. This guide follows one request from start to finish.",
    ],
    keyPoints: [
      "Data travels as small packets that take independent routes and are put back together at the other end.",
      "DNS turns a name such as example.com into a numeric address, and HTTPS encrypts the conversation so that others on the path cannot read it.",
      "Most traffic between continents travels through fibre-optic cables, many of them laid on the sea floor.",
    ],
    sections: [
      {
        heading: 'A network of networks',
        paragraphs: [
          "Your phone connects to a local network: a mobile tower or a Wi-Fi router. That network belongs to an internet service provider (ISP), which in turn connects to other, larger networks. Where networks meet and exchange traffic, usually in large data centres, the points are called internet exchanges. India has several, run under the National Internet Exchange of India and by private operators, and keeping traffic between Indian networks inside the country makes it faster and cheaper than sending it abroad and back.",
        ],
      },
      {
        heading: 'Addresses and names',
        paragraphs: [
          "Every device on the internet has an IP address, a number that says where to send data. The older version, IPv4, has four numbers such as 192.0.2.1 and allows about 4.3 billion addresses, which have run out. The newer version, IPv6, uses much longer numbers and allows more addresses than there are grains of sand on Earth.",
          "People use names, not numbers. The Domain Name System (DNS) is the internet's phone book: when you type a name, your device asks a DNS resolver, often run by your ISP, for the matching IP address. Answers are remembered for a while, so most lookups finish in a few milliseconds.",
        ],
      },
      {
        heading: 'Packets',
        paragraphs: [
          "Sending a whole photo or web page as one block would be fragile and slow, so the data is cut into packets of a thousand bytes or so, each labelled with where it is from and where it is going. Routers along the way read the label and pass each packet towards its destination, and different packets of the same message may take different routes.",
          "At the other end a protocol called TCP puts the packets back in order and asks for any that were lost to be sent again. Some applications, such as video calls and online games, use a faster protocol called UDP, which does not wait for lost packets, because a late packet is no use in a live call. Newer systems such as QUIC combine speed and reliability.",
        ],
      },
      {
        heading: 'Fetching a page, step by step',
        paragraphs: ["When you open a website, roughly this happens:"],
        bullets: [
          "Your browser asks DNS for the IP address of the site.",
          "It opens a connection to that address and agrees an encryption key with the server in a handshake. The server proves its identity with a certificate issued by an authority your browser trusts. This is the S in HTTPS.",
          "The browser sends an HTTP request for the page, and the server replies with the page's HTML.",
          "The HTML points to more files: styles, scripts, fonts and images. The browser requests those as well, often from several servers.",
          "The browser assembles everything and draws the page.",
        ],
      },
      {
        heading: 'Cables, towers and satellites',
        paragraphs: [
          "The great majority of traffic between continents travels through fibre-optic cables, glass threads that carry pulses of light, many of them laid along the sea floor. Mumbai and Chennai are among the main places where these cables come ashore in India. Within a country, fibre links cities and towns, and the last stretch to your phone is radio, from a 4G or 5G tower. Satellites serve ships, aircraft and places that cables do not reach.",
          "A content delivery network (CDN) keeps copies of popular pages and videos on servers close to users, so that a page about a match is served from a nearby city and not from another continent.",
        ],
      },
      {
        heading: 'Why it is sometimes slow',
        paragraphs: [
          "Light travels through glass at about 200,000 kilometres a second, so every 1,000 kilometres costs about 5 milliseconds one way. That puts a floor under delays: a server on another continent can never be as quick as one in the next city. Beyond distance, delay comes from crowded networks, weak Wi-Fi, a busy server, or a long chain of requests that must be made one after another. When a page is slow, the fault can be at any of these steps, which is why fixing it begins with finding out which one.",
        ],
      },
    ],
  },

  {
    slug: 'how-ai-chatbots-and-summaries-work',
    title: 'How AI chatbots and summaries work, and why they sometimes get things wrong',
    topic: 'technology',
    summary:
      'Large language models predict text. That makes them fluent and useful for summaries, and it also explains why they can state falsehoods with confidence.',
    published: '2026-11-10',
    updated: '2026-11-10',
    related: ['how-science-works', 'how-to-read-the-news-critically'],
    intro: [
      "AI chatbots can answer questions, draft emails and summarise articles in seconds, and they sometimes state something false in the same calm voice. Both behaviours come from the same design, and understanding it makes you a better user of the tools, and a more careful reader of anything written with them, including parts of Plax.",
      "The technology behind most of these tools is called a large language model, or LLM.",
    ],
    keyPoints: [
      "A language model is trained to predict the next piece of text, and learns patterns from a very large amount of writing.",
      "It does not look facts up unless it is connected to a source, and it can produce fluent statements that are false, often called hallucinations.",
      "A summary of a text that the model has in front of it is safer than an open question, but it can still leave things out, distort them or overstate them.",
    ],
    sections: [
      {
        heading: 'Predicting the next word',
        paragraphs: [
          "Text is first cut into small pieces called tokens, roughly words or parts of words. During training the model is shown vast amounts of text with a piece hidden and asked to guess it, and its internal settings, billions of numbers called parameters, are adjusted every time it guesses wrong. After many rounds it becomes very good at estimating which token is likely to come next in a given context.",
          "To produce an answer, the model estimates the probabilities of the next token, picks one, adds it to the text and repeats. A setting often called temperature controls how adventurous the choice is. It is autocomplete at an enormous scale, and the surprising thing is how much knowledge and reasoning-like behaviour comes out of it.",
        ],
      },
      {
        heading: 'From predictor to assistant',
        paragraphs: [
          "A model trained only to continue text will happily continue a question with another question. To make it behave like an assistant, developers train it further on examples of good answers and use human feedback to rate its responses, so that it learns to follow instructions and to refuse some requests. Hidden instructions, called a system prompt, set its tone and rules for a particular product.",
        ],
      },
      {
        heading: 'Why they make things up',
        paragraphs: [
          "The model has no built-in notion of truth. It is trained to produce text that is plausible given what came before. If it has seen a fact many times it usually repeats it correctly. If a question is about something obscure, recent or absent from its training, it still produces fluent text, and the fluency can hide the fact that the content is invented. Its knowledge also stops at the date its training data ended, unless it is given a way to search.",
          "Fabricated references are a well-known result: ask for a source and the model may produce a title, authors and a journal that look right and do not exist. The remedy is not to trust a model's memory for facts that matter. Tools that let it retrieve documents and quote from them reduce the problem but do not remove it.",
        ],
      },
      {
        heading: 'Summaries: safer, but not safe',
        paragraphs: [
          "When a model is given a text and asked to summarise it, the facts are in front of it, so it has much less need to invent. This is why summarisation is among the most dependable uses of these models. It is still possible for a summary to go wrong in predictable ways:",
        ],
        bullets: [
          "Dropping qualifiers. Alleged, may, according to and up to disappear, and a possibility reads as a fact.",
          "Getting a number or a name wrong, or attaching a statement to the wrong person.",
          "Merging two details from different parts of the text into one that the source never said.",
          "Emphasis. What a summary leaves out is as much a choice as what it includes, so the same article can be summarised in ways that lean differently.",
        ],
      },
      {
        heading: 'How Plax uses AI',
        paragraphs: [
          "The stories in the Plax feed are short summaries of what publishers have published. For each story, Plax takes the headline and the description or opening the publisher provides, and an AI model is asked to write a short brief that sticks to those facts, adds no opinion, and leads with the most important point. Every story links to the original at its publisher, and the headline is the link, so a reader can check anything that matters. Features such as Go deeper, which add background on request, are written by AI too, are labelled as such, and can contain mistakes. Our editorial policy describes this in more detail.",
        ],
      },
      {
        heading: 'Using AI output sensibly',
        paragraphs: [
          "Treat AI output as a first draft from a fast, well-read assistant who sometimes bluffs. Check numbers, names and dates against the source. Be most careful in health, money and law, where a confident mistake costs the most. Ask for the source and follow it. And when the answer matters, ask the same question in a different way: if the answers disagree, that is a sign the model is guessing.",
        ],
      },
    ],
  },

  {
    slug: 'what-is-an-api',
    title: 'What is an API? A plain-language guide with real examples',
    topic: 'programming',
    summary:
      'APIs let one program ask another for data or actions. Requests, responses, JSON, status codes, keys and rate limits, explained through everyday examples.',
    published: '2026-11-10',
    updated: '2026-11-10',
    related: ['how-the-internet-works', 'how-ai-chatbots-and-summaries-work'],
    intro: [
      "API stands for application programming interface. It is the agreed way for one piece of software to ask another to do something: give me today's weather, charge this card, post this photo. Almost every app on your phone is a collection of calls to APIs.",
      "The usual comparison is a restaurant. You do not walk into the kitchen. You tell the waiter what you want from the menu, the waiter takes your order to the kitchen, and a plate comes back. The menu and the rules for ordering are the API, and the kitchen's inner workings stay hidden.",
    ],
    keyPoints: [
      "An API defines what you can ask for, how to ask, and what shape the answer takes.",
      "Web APIs usually work over HTTP and reply in JSON, a simple text format for structured data.",
      "Keys, rate limits and status codes keep APIs secure and predictable.",
    ],
    sections: [
      {
        heading: 'A request and a response',
        paragraphs: [
          "On the web, an API call is an HTTP request sent to an address called an endpoint. It has a method that says what to do, a path that says to what, optional parameters, and sometimes a body of data. The server replies with a status code and, usually, data. Here is an imaginary weather API:",
        ],
        example:
          'Request:   GET https://api.example.com/v1/weather?city=Pune\nResponse:  200 OK\n           {"city": "Pune", "temperature_c": 27, "humidity": 61}',
      },
      {
        heading: 'JSON, the common language',
        paragraphs: [
          "The answer above is JSON (JavaScript Object Notation), a text format made of names and values, lists and nested objects. It is easy for people to read and for programs of any language to parse, which is why it became the standard for web APIs. Older systems use XML, and some modern ones use more compact formats, but a developer meets JSON first.",
        ],
      },
      {
        heading: 'Methods and status codes',
        paragraphs: [
          "The common methods are GET to read data, POST to create something, PUT or PATCH to change it, and DELETE to remove it. The status code in the response tells the caller what happened.",
        ],
        bullets: [
          "200 means success, and 201 means something was created.",
          "400 means the request was malformed, 401 means you have not proved who you are, 403 means you are not allowed, and 404 means the thing does not exist.",
          "429 means you have sent too many requests and must slow down.",
          "500 and above mean the fault is on the server's side.",
        ],
      },
      {
        heading: 'Keys, tokens and secrets',
        paragraphs: [
          "Many APIs need to know who is calling. A simple method is an API key, a long random string sent with each request, which lets the provider identify, limit and bill the caller. Where an app acts on behalf of a user, as in Sign in with Google, a protocol called OAuth gives the app a token that allows only what the user agreed to, without giving it the password.",
          "Keys are secrets. A key that is put in the code of a website or an app that anyone can inspect can be copied and abused, so serious applications keep keys on a server and call the API from there.",
        ],
      },
      {
        heading: 'Limits, pages and webhooks',
        paragraphs: [
          "To protect themselves, APIs set rate limits, a cap on requests in a given time, and return pages of results, with a way to ask for the next page, rather than everything at once. A well-behaved client waits when it is told to, and retries after a pause instead of hammering the server.",
          "Sometimes the flow goes the other way. A webhook is an API call that a service makes to you when something happens, for example when a payment succeeds, so that you do not have to keep asking.",
        ],
      },
      {
        heading: 'APIs you already use',
        paragraphs: [
          "A ride-hailing app asks a maps service for a route and a payments service to take the fare. A payments app on your phone talks to your bank through the interfaces behind UPI. A news reader asks publishers' feeds for the latest items, which is also how Plax receives most of its stories. Even a weather widget on your home screen is an API call every few hours.",
          "Good APIs are designed with the user in mind: clear names, stable versions so that old callers keep working, helpful error messages and honest documentation. Bad ones change without warning, which is why developers read the changelog before upgrading.",
        ],
      },
    ],
  },
]
