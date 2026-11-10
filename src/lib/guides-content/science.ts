import type { Guide } from '../guides.ts'

// Science, space, nature, health and mathematics. The health guide carries the note on the page: it explains how something works and is not medical advice.
export const SCIENCE_GUIDES: Guide[] = [
  {
    slug: 'why-the-sky-is-blue',
    title: 'Why the sky is blue, and why sunsets are red',
    topic: 'physics',
    summary:
      'The colour of the sky comes from the way air molecules scatter sunlight. The same physics explains red sunsets, white clouds and the black sky on the Moon.',
    published: '2026-11-10',
    updated: '2026-11-10',
    related: ['how-science-works', 'how-rockets-reach-orbit'],
    intro: [
      "It is one of the first questions a child asks and one of the best examples of how a simple observation leads to real physics. The sky is not blue because it reflects the sea, and it is not blue because of dust. It is blue because of what air does to sunlight.",
      "The answer takes in three ideas: that sunlight is a mixture of colours, that small particles scatter short wavelengths far more than long ones, and that what reaches your eye depends on the path the light took.",
    ],
    keyPoints: [
      "Sunlight contains all colours; air molecules scatter blue light about six times more strongly than red.",
      "At sunrise and sunset the light crosses far more air, so most of the blue is scattered away and the reds and oranges remain.",
      "Clouds look white because water droplets are much bigger than the molecules of air and scatter all colours alike.",
    ],
    sections: [
      {
        heading: 'Sunlight is a mixture',
        paragraphs: [
          "In the seventeenth century Isaac Newton passed a beam of sunlight through a glass prism and showed that it spreads into a band of colours, from red through yellow and green to blue and violet. White light is a mixture of all of them. Each colour is a different wavelength of light, from about 700 nanometres for red to about 400 for violet.",
        ],
      },
      {
        heading: 'Scattering by air',
        paragraphs: [
          "The air is made mostly of nitrogen and oxygen molecules, which are much smaller than the wavelength of light. When light meets a particle that small, it is scattered in all directions, and the physicist Lord Rayleigh showed in the 1870s that the amount of scattering is inversely proportional to the fourth power of the wavelength. In plain terms, short waves are scattered much more than long ones.",
          "Blue light, at about 450 nanometres, is scattered roughly six times more strongly than red light at 700. As sunlight passes through the atmosphere, the blue is knocked sideways again and again, so that it arrives at your eye from every part of the sky. The red, scattered much less, mostly carries on in a straight line.",
        ],
        example: "Scattering is proportional to 1 / wavelength^4\n(700 / 450)^4 = about 5.9\nSo blue (450 nm) is scattered about 6 times more than red (700 nm).",
      },
      {
        heading: 'Why not violet?',
        paragraphs: [
          "Violet light has an even shorter wavelength and is scattered even more. The sky is not violet mainly for two reasons: the Sun emits less violet than blue, and human eyes are much less sensitive to violet than to blue. The mixture of everything that arrives looks blue to us. A different eye, in a different animal, may see the sky differently.",
        ],
      },
      {
        heading: 'Sunsets and sunrises',
        paragraphs: [
          "When the Sun is low, its light has to cross a far thicker layer of air to reach you. Along that long path the blue and green are scattered out of the beam, and what remains is orange and red. That is why the Sun itself looks red at the horizon while the sky overhead is still blue.",
          "Dust, smoke and haze can deepen sunsets, which is why the sky after a dust storm or a volcanic eruption can be remarkable. A very clean sky tends to give pale sunsets, and a polluted one can give deep red ones, though at a cost to air quality.",
        ],
      },
      {
        heading: 'White clouds and grey rain',
        paragraphs: [
          "Water droplets in clouds are thousands of times larger than air molecules, and they scatter all wavelengths in a similar way, a process called Mie scattering. All colours leave the cloud together, so it looks white. A thick cloud absorbs and scatters much of the light that enters it, so its base looks grey, and a rain cloud darker still.",
        ],
      },
      {
        heading: 'Other skies and a kitchen experiment',
        paragraphs: [
          "The Moon has no atmosphere, so there is nothing to scatter light and the sky is black even at midday. On Mars the thin atmosphere is full of fine dust, which makes the daytime sky a butterscotch colour, and the area around the setting Sun appears blue, the reverse of what we see on Earth.",
          "You can see the effect at home. Stir a few drops of milk into a glass of water and shine a torch through it. Seen from the side, the water looks faintly bluish, because the milk particles scatter blue most. Looking at the torch through the glass, the beam looks yellowish or orange, as the blue has been scattered away from it. It is a small version of a sunset.",
        ],
      },
    ],
  },

  {
    slug: 'how-rockets-reach-orbit',
    title: 'How rockets reach orbit: why going sideways matters more than going up',
    topic: 'space',
    summary:
      'Reaching orbit is mostly about speed, not height. A plain explanation of the rocket equation, staging, and how ISRO and others launch satellites.',
    published: '2026-11-10',
    updated: '2026-11-10',
    related: ['why-the-sky-is-blue', 'how-science-works'],
    intro: [
      "It is natural to think that a rocket has to go high enough to escape gravity. The surprise is that a satellite in low orbit is not beyond Earth's gravity at all. At the altitude of the International Space Station, gravity is still about nine-tenths as strong as on the ground. The satellite stays up because it is moving sideways fast enough that, as it falls, the ground curves away beneath it.",
      "Getting into orbit is mostly a matter of speed. Altitude is the easy part.",
    ],
    keyPoints: [
      "A low orbit needs a sideways speed of about 7.8 kilometres a second, roughly 28,000 kilometres an hour.",
      "Most of a rocket's mass at lift-off is fuel, and it is built in stages so that empty tanks can be dropped.",
      "Launching towards the east from a site near the equator, such as Sriharikota, borrows some speed from the rotation of the Earth.",
    ],
    sections: [
      {
        heading: 'Orbit is falling around the Earth',
        paragraphs: [
          "Newton imagined a cannon on a high mountain firing a ball horizontally. The faster the ball leaves, the farther it lands, and at a high enough speed the Earth's surface curves away as fast as the ball drops, so the ball never lands. For a low Earth orbit at around 400 kilometres, that speed is about 7.8 kilometres a second. Astronauts are weightless not because gravity is absent but because they and their craft are in continuous free fall.",
        ],
      },
      {
        heading: 'The tyranny of the rocket equation',
        paragraphs: [
          "A rocket accelerates by throwing mass backwards, and the relationship between the speed it can gain, the speed of its exhaust and the share of its mass that is fuel was worked out by the Russian schoolteacher Konstantin Tsiolkovsky, who published it in 1903. The relationship is logarithmic, which is bad news: to get a little more speed you need a great deal more fuel, and the extra fuel itself has to be lifted.",
          "The result is that a launch vehicle is mostly propellant. At lift-off, around nine-tenths of the mass of a typical rocket is fuel and oxidiser, and the satellite on top is a small fraction of the total.",
        ],
      },
      {
        heading: 'Stages',
        paragraphs: [
          "To make the best of this, rockets are built in stages. When the first stage has burned its fuel, it is dropped, and the second stage lights, no longer carrying the weight of the empty tanks. India's workhorse Polar Satellite Launch Vehicle has four stages, alternating solid and liquid fuel. Larger vehicles such as the LVM3 use a cryogenic upper stage, which burns liquid hydrogen and liquid oxygen, a combination that gives more thrust for each kilogram of propellant.",
          "Strap-on boosters are fitted alongside the first stage to give extra thrust at the start, and a streamlined fairing protects the satellite through the thick air and is thrown off once the rocket has climbed above most of the atmosphere.",
        ],
      },
      {
        heading: 'The shape of a launch',
        paragraphs: [
          "A rocket rises vertically at first to get out of the densest air, then tilts over gradually, in what is called a gravity turn, and picks up speed horizontally. The moment of greatest stress on the vehicle, called max-Q, comes about a minute in, when it is moving fast in air that is still fairly thick. After the stages have done their work, the final burn puts the satellite into the orbit that was planned for it.",
        ],
      },
      {
        heading: 'Different orbits for different jobs',
        paragraphs: [
          "Low Earth orbit, a few hundred kilometres up, is used for crewed stations and for many imaging and communications satellites. Sun-synchronous orbits pass over each place at the same local time every day, which suits Earth observation. Geostationary orbit, at 35,786 kilometres above the equator, is the one altitude at which a satellite takes exactly a day to circle the Earth, so it appears fixed in the sky, which suits broadcasting and weather satellites.",
          "India's launches take place at the Satish Dhawan Space Centre on the island of Sriharikota, on the east coast, at about 14 degrees north. Launching east lets rockets use the Earth's rotation, which at that latitude gives them about 0.45 kilometres a second for free, and the sea to the east is the safest place for dropped stages to fall.",
        ],
      },
      {
        heading: 'Reusability and how to read launch headlines',
        paragraphs: [
          "Because most of the cost of a launch is the vehicle that is thrown away, reusing it is the biggest lever on cost. SpaceX landed an orbital-class booster for the first time in December 2015, and India has tested a winged reusable vehicle in landing experiments. In a launch headline, the numbers to look for are the payload mass and the orbit it is going to, because carrying one tonne to low Earth orbit is far easier than carrying it to geostationary transfer orbit. And a successful launch is not a successful mission: it is only the first step.",
        ],
      },
    ],
  },

  {
    slug: 'how-the-indian-monsoon-works',
    title: 'How the Indian monsoon works, and why forecasts matter',
    topic: 'nature',
    summary:
      "The south-west monsoon brings most of India's yearly rain. What drives it, how it moves across the country, and how to read the headlines about it.",
    published: '2026-11-10',
    updated: '2026-11-10',
    related: ['what-is-inflation', 'how-science-works'],
    intro: [
      "For much of India, the year is organised around one event: the arrival of the south-west monsoon in June. It brings roughly three-quarters of the country's annual rainfall, fills the reservoirs, decides the kharif harvest and sets the mood of markets and newsrooms.",
      "The word comes from the Arabic mausim, meaning a season. At its heart, the monsoon is a seasonal reversal of the winds.",
    ],
    keyPoints: [
      "In summer the land heats faster than the ocean, drawing moist winds from the Indian Ocean towards the subcontinent.",
      "The rains normally reach Kerala around 1 June, cover the whole country by early July and start to withdraw from the north-west in mid-September.",
      "Total rainfall is not enough: how it is spread across time and regions matters as much for crops and floods.",
    ],
    sections: [
      {
        heading: 'A wind that changes direction',
        paragraphs: [
          "Land heats and cools faster than water. In summer the great landmass of South Asia, and the Tibetan plateau to the north, become very hot, the air above them rises and a belt of low pressure forms. The Indian Ocean to the south stays cooler, with higher pressure. Air flows from the high to the low, and the winds that cross the equator and bend towards India carry vast amounts of moisture picked up from the warm sea.",
          "In winter the pattern reverses: the land is cold, the winds blow from the north-east and the air is mostly dry, except for the north-east monsoon that brings rain to the coast of Tamil Nadu in October to December.",
        ],
      },
      {
        heading: 'The journey across the country',
        paragraphs: [
          "The normal date for the monsoon to arrive over Kerala is 1 June, and it advances in two currents: an Arabian Sea branch up the west coast, and a Bay of Bengal branch that moves into the north-east and then west along the Gangetic plain. By about 8 July it normally covers the whole country. Withdrawal begins from the north-west, usually from about 17 September, and the rains retreat down the peninsula over the following weeks. The India Meteorological Department (IMD) revised these normal dates in 2020 to reflect recent decades.",
          "On the way, the Western Ghats force the moist air upward, so the windward slopes of the coast get some of the heaviest rain in the country, while areas on the leeward side, which lie in a rain shadow, are much drier. Low-pressure systems that form over the Bay of Bengal and travel inland bring heavy spells to central India.",
        ],
      },
      {
        heading: 'Active spells and breaks',
        paragraphs: [
          "The monsoon does not rain continuously. It comes in bursts of days of heavy rain, called active spells, separated by lulls, called breaks, which can last a week or two. A long break in July can stress crops even in a year when the season total turns out normal.",
        ],
      },
      {
        heading: 'What can shift it',
        paragraphs: [
          "El Niño, a warming of the central and eastern Pacific, tends to weaken the Indian monsoon, and the opposite phase, La Niña, tends to help it, but the link is not rigid. The Indian Ocean Dipole, a difference in sea temperature between the western and eastern Indian Ocean, can offset El Niño: in 1997 a strong El Niño was accompanied by a normal monsoon, thanks in part to a strongly positive dipole. Other factors include the snow cover in Eurasia in the preceding winter and the temperatures over land.",
        ],
      },
      {
        heading: 'Forecasts and what the words mean',
        paragraphs: [
          "The IMD issues a long-range forecast in April and an update around the end of May. It expresses the expected rainfall as a percentage of the long-period average, which for the June to September season is about 87 centimetres. The categories have exact meanings.",
        ],
        bullets: [
          "Normal: 96 to 104 per cent of the long-period average.",
          "Below normal: 90 to 95 per cent. Deficient: below 90 per cent.",
          "Above normal: 105 to 110 per cent. Excess: above 110 per cent.",
        ],
      },
      {
        heading: 'Why it matters, and how to read the headlines',
        paragraphs: [
          "A large part of India's workforce, close to half by most surveys, still depends on farming, and most farms depend on the monsoon for at least part of their water. A good monsoon supports rural incomes and holds down food prices, while a poor one can push up the prices of vegetables and pulses, and with them inflation. Reservoir levels also feed into drinking water and hydropower for the following year.",
          "When reading a monsoon report, look beyond the national percentage. Ask how rainfall is spread across regions, whether there have been long dry spells, how sowing is progressing and how full the reservoirs are. A season can finish at a normal total after a flood in one week and a drought in another, and for a farmer that is not a normal year.",
        ],
      },
    ],
  },

  {
    slug: 'how-vaccines-work',
    title: 'How vaccines work: training the immune system without the disease',
    topic: 'health',
    summary:
      'Vaccines teach the body to recognise a germ before it meets it. How they work, the main types, what herd immunity means, and how safety is checked.',
    published: '2026-11-10',
    updated: '2026-11-10',
    disclaimer: 'health',
    related: ['how-science-works', 'bayes-theorem-in-plain-words'],
    intro: [
      "A vaccine gives the immune system a safe preview of a germ, so that if the real one arrives, the body already knows how to fight it. The principle is old and simple, and the details are some of the most carefully studied in medicine.",
      "This guide explains how vaccines work in general. It is not medical advice, and decisions about vaccination are best made with a doctor or the national immunisation schedule.",
    ],
    keyPoints: [
      "A vaccine contains a harmless form or piece of a germ, called an antigen, which trains the immune system to recognise it.",
      "After vaccination the body keeps memory cells that respond faster and more strongly on a later meeting with the real germ.",
      "When enough people are immune, the germ has fewer people to spread to, which also protects those who cannot be vaccinated.",
    ],
    sections: [
      {
        heading: 'Immunity has a memory',
        paragraphs: [
          "When a germ enters the body, the immune system's first line of defence responds in minutes to hours, but in a general way. The second line, called adaptive immunity, takes days to build a response aimed at the particular invader: B cells make antibodies that bind to it, and T cells kill infected cells or coordinate the response. In the first encounter this is slow, and the germ may do damage before the body has caught up.",
          "The important part is what happens afterwards. Some of these cells survive as memory cells, which can stay for years or a lifetime and respond within hours when the same germ appears again. A vaccine produces that memory without the dangers of the disease.",
        ],
      },
      {
        heading: 'What is in a vaccine',
        paragraphs: ["Vaccines use several different approaches to show the immune system the antigen."],
        bullets: [
          "Live attenuated vaccines use a weakened form of the germ, as in the measles, mumps and rubella vaccine, the BCG vaccine against tuberculosis, and the oral polio vaccine.",
          "Inactivated vaccines use a killed germ, as in the injected polio vaccine and some hepatitis A vaccines.",
          "Subunit and conjugate vaccines use a part of the germ, such as a protein or a sugar coat, as in hepatitis B and several vaccines against bacterial infections.",
          "Toxoid vaccines use a harmless form of a toxin made by the germ, as in tetanus and diphtheria vaccines.",
          "mRNA and viral vector vaccines give the body's cells instructions to make a single protein of the germ, so that the immune system can learn to recognise it. Several COVID-19 vaccines used these methods.",
        ],
      },
      {
        heading: 'Adjuvants and boosters',
        paragraphs: [
          "Some vaccines contain an adjuvant, a substance such as an aluminium salt that strengthens the immune response. Many need more than one dose, or later boosters, because the protection fades over time. Some germs also change, which is why influenza vaccines are updated each year to match the strains that are circulating.",
        ],
      },
      {
        heading: 'Herd immunity',
        paragraphs: [
          "A germ spreads when each infected person passes it on to at least one other. If enough people in a community are immune, most of those chains break, and the germ finds it difficult to spread at all. The share that is needed depends on how contagious the germ is. For measles, one of the most contagious diseases known, about 95 per cent immunity is usually needed. This indirect protection matters most for babies who are too young to be vaccinated and for people whose immune systems are weak.",
        ],
      },
      {
        heading: 'How safety is checked',
        paragraphs: [
          "Before a vaccine is approved, it goes through laboratory studies and then three phases of trials in people, beginning with small groups and ending with thousands, to test safety and how well it works. Regulators, in India the Central Drugs Standard Control Organisation, review the data before approval. Monitoring continues afterwards: health systems collect reports of adverse events after immunisation, and investigate them to find out whether the vaccine caused them or the event would have happened anyway. Rare problems that are too uncommon to show up in a trial can be found this way.",
          "Mild effects such as a sore arm, tiredness or a short fever are common and show that the immune system is responding. Serious reactions are rare, and what matters is how they compare with the harm of the disease.",
        ],
      },
      {
        heading: 'A short history',
        paragraphs: [
          "In 1796 the English doctor Edward Jenner showed that exposure to cowpox protected against smallpox, and the word vaccine comes from the Latin for cow. The World Health Organization declared smallpox eradicated in 1980, the only human disease so far to be wiped out in this way. India was certified polio-free in March 2014, three years after its last reported case, after vaccination campaigns that reached more than 100 million children under five in each national round. These are among the clearest examples of what organised vaccination can do.",
        ],
      },
    ],
  },

  {
    slug: 'how-science-works',
    title: 'How science works: hypotheses, evidence and peer review',
    topic: 'science',
    summary:
      'A short guide to how scientific claims are tested and checked, and why a headline that says a study shows something deserves a closer look.',
    published: '2026-11-10',
    updated: '2026-11-10',
    related: ['bayes-theorem-in-plain-words', 'how-to-read-the-news-critically', 'cognitive-biases-and-the-news'],
    intro: [
      "Science is often presented as a list of facts, and it is better understood as a way of finding out. It is a set of habits for testing ideas against evidence, and for finding and correcting mistakes, including its own.",
      "Understanding those habits makes science news much easier to read, because it shows what a single study can and cannot tell you.",
    ],
    keyPoints: [
      "A scientific claim has to be testable: there must be some result that would show it to be wrong.",
      "Good experiments use controls, randomisation and large enough samples; correlation alone does not show cause.",
      "One study is a step, not a conclusion. Confidence comes from many independent results pointing the same way.",
    ],
    sections: [
      {
        heading: 'Questions, hypotheses and predictions',
        paragraphs: [
          "Science begins with an observation or a question. A hypothesis is a proposed explanation, and a useful one makes predictions that could turn out to be false. The philosopher Karl Popper made this idea of falsifiability famous: a claim that no result could ever contradict is not a scientific one, however attractive it is.",
          "In everyday speech a theory means a guess. In science it means something much stronger: a well-tested explanation that ties many observations together, such as the theory of evolution by natural selection, the germ theory of disease or the theory of general relativity.",
        ],
      },
      {
        heading: 'Fair tests',
        paragraphs: [
          "To test whether a treatment works, a researcher needs a comparison. In a randomised controlled trial, people are assigned by chance to receive the treatment or a placebo, so that the two groups are alike apart from the treatment. Blinding, in which neither the participants nor the researchers who assess them know who received which, stops expectations from colouring the results.",
          "Many questions cannot be tested this way, for ethical or practical reasons, and have to be studied by observation, which is where the dangers of confounding arise. Ice cream sales and drownings both rise in summer, but ice cream does not cause drowning. Heat explains both. Careful studies try to measure and adjust for such hidden factors, and good scientists say plainly when they cannot.",
        ],
      },
      {
        heading: 'Numbers that are easy to misread',
        paragraphs: [
          "A small study can easily mislead, because chance plays a larger part in a small sample, so how many people or samples were studied is always worth checking. A p-value measures how surprising the data would be if there were no real effect. It does not tell you the probability that the claim is true, and a result can be statistically significant and still tiny in practice. The size of the effect, and the range of uncertainty around it, usually tell you more.",
        ],
      },
      {
        heading: 'Peer review and replication',
        paragraphs: [
          "Before most journals publish a paper, other experts in the field review it and may ask for changes or reject it. Peer review catches many errors, but it does not guarantee that the work is right, and it cannot find fraud easily. A preprint, a paper posted online before review on sites such as arXiv, has not yet been through it.",
          "The real test is replication: whether other teams, using their own samples, get the same result. In some fields, notably parts of psychology and biomedicine, attempts to repeat famous findings have often failed, which led to reforms such as registering a study's plan in advance, sharing data, and publishing negative results.",
        ],
      },
      {
        heading: 'Consensus and uncertainty',
        paragraphs: [
          "Scientists speak in degrees of confidence, and that is often mistaken for weakness. When a scientific body says something is very likely, it has weighed a large body of independent evidence, and it is giving a calibrated statement, not hedging. A scientific consensus, such as on climate change or on vaccine safety, is the position that careful reviews of the evidence have reached, and it changes when new evidence demands it.",
        ],
      },
      {
        heading: 'Reading science in the news',
        paragraphs: ["A few questions help with almost any report on a new study:"],
        bullets: [
          "Was it done on people, or on mice or cells? Results in animals often do not carry over.",
          "How big was the sample, and who was in it?",
          "Does the headline say causes when the study only found an association?",
          "Is it one study or a review of many? Does it agree with earlier work?",
          "Who paid for it, and does the press release claim more than the paper?",
          "Are the words may, could and might in the paper turned into will and does in the headline?",
        ],
      },
    ],
  },

  {
    slug: 'bayes-theorem-in-plain-words',
    title: "Bayes' theorem in plain words: how evidence should change your mind",
    topic: 'math',
    summary:
      'Bayes theorem is a rule for updating a belief when new evidence arrives. A worked medical-test example shows why rare events and positive tests surprise us.',
    published: '2026-11-10',
    updated: '2026-11-10',
    related: ['how-science-works', 'cognitive-biases-and-the-news'],
    intro: [
      "A test for a rare disease is 90 per cent accurate, and your result is positive. How likely is it that you have the disease? Most people say about 90 per cent. The correct answer can be less than 10 per cent, and understanding why is the heart of an idea named after the eighteenth-century English minister Thomas Bayes.",
      "Bayes' theorem is a rule for how to change your mind in the light of evidence. It says that the answer depends not only on how good the evidence is, but also on how likely the thing was to be true before you saw it.",
    ],
    keyPoints: [
      "Start with a prior: how likely the claim was before the new evidence.",
      "Weigh the evidence by how much more likely it is if the claim is true than if it is false.",
      "Ignoring the base rate, how common something is to begin with, is one of the most frequent mistakes in reasoning about risk.",
    ],
    sections: [
      {
        heading: 'The rule',
        paragraphs: [
          "In symbols, the probability of A given that B has been observed is the probability of B given A, times the prior probability of A, divided by the overall probability of B.",
        ],
        example: "P(A | B) = P(B | A) x P(A) / P(B)\n\nA = the claim (for example, you have the disease)\nB = the evidence (for example, a positive test)",
      },
      {
        heading: 'A worked example',
        paragraphs: [
          "Suppose a disease affects 1 in 100 people. A test correctly detects it in 90 per cent of people who have it, and wrongly gives a positive result to 10 per cent of people who do not. Take 1,000 people. About 10 have the disease and 9 of them test positive. Of the 990 who do not, about 99 test positive by mistake. In all, 108 people test positive, and only 9 of them are really ill. A positive result therefore means about a 1 in 12 chance of having the disease, roughly 8 per cent.",
          "The test is good, and the result is still more likely to be a false alarm than a true positive, because the disease is rare and the healthy are many. If the same test were used on people who already had symptoms, so that the disease was far more common among them, the same positive result would be much more convincing.",
        ],
        example: "1,000 people tested\n  10 have the disease    -> 9 test positive\n 990 do not             -> 99 test positive (false alarms)\nAll positives: 9 + 99 = 108\nChance a positive is real: 9 / 108 = about 8%",
      },
      {
        heading: 'Why it matters outside the clinic',
        paragraphs: [
          "The same reasoning applies whenever something rare is screened for. A system that flags suspicious transactions, faces in a crowd or messages that look like spam will produce many false alarms if the thing it is looking for is uncommon, even when the system is very accurate. Spam filters use Bayes' theorem directly: the presence of a word such as lottery raises the probability that a message is spam, because it is far more common in spam than in genuine mail.",
          "In news stories, base rates are often missing. A report that a test, a camera or an algorithm is 99 per cent accurate says little until you know how common the thing being detected is.",
        ],
      },
      {
        heading: 'Who was Bayes?',
        paragraphs: [
          "Thomas Bayes was a Presbyterian minister and mathematician who died in 1761. His essay on the problem was found among his papers and published in 1763 by his friend Richard Price. The French mathematician Pierre-Simon Laplace later developed the idea independently and made it a general tool. For much of the twentieth century it was overshadowed by other methods of statistics, and it is now widely used in medicine, machine learning and many other fields.",
        ],
      },
      {
        heading: 'Common mistakes, and a habit',
        paragraphs: [
          "The classic error is to confuse the probability of the evidence given the claim with the probability of the claim given the evidence. A court that hears that the chance of a match by coincidence is one in a million may conclude that the chance of innocence is also one in a million, which does not follow; it is known as the prosecutor's fallacy. Overconfidence in a single piece of evidence is another.",
          "A useful habit is to ask two questions whenever new evidence arrives. How common was this to begin with? And how often would I see this evidence even if the claim were false?",
        ],
      },
    ],
  },
]
