import type { Guide } from '../guides.ts'

// Money, markets and business. These are general explanations, not advice: each one that concerns money carries the note on the page.
export const MONEY_GUIDES: Guide[] = [
  {
    slug: 'what-is-inflation',
    title: 'What is inflation, and how is it measured in India?',
    topic: 'finance',
    summary:
      'Inflation is a sustained rise in the general level of prices. How India measures it, why the RBI watches it, and what it does to your savings and loans.',
    published: '2026-11-10',
    updated: '2026-11-10',
    disclaimer: 'money',
    related: ['how-the-repo-rate-works', 'how-the-union-budget-works'],
    intro: [
      "Inflation is a sustained rise in the general level of prices. If it runs at 6 per cent a year, a basket of goods that cost ₹1,000 a year ago costs about ₹1,060 today. A single price going up is not inflation; the word describes prices rising broadly, and staying up.",
      "Because wages, savings, loans and government budgets are all counted in rupees, inflation quietly changes what each rupee can buy. That is why it is one of the most watched numbers in the news, and why one month's reading can move bond and stock markets.",
    ],
    keyPoints: [
      "Inflation is the rate at which the general price level rises, not the rise of any one price.",
      "India's headline measure is the Consumer Price Index (CPI), published every month by the Ministry of Statistics and Programme Implementation.",
      "The Reserve Bank of India aims to keep CPI inflation near 4 per cent, within a band of 2 to 6 per cent.",
    ],
    sections: [
      {
        heading: 'How inflation is measured',
        paragraphs: [
          "Statisticians cannot follow every price, so they follow a fixed basket: the things a typical household buys, weighted by how much of its budget each one takes. Food, housing, fuel, clothing, transport, health and education all go in. Price collectors record what the items cost in sampled markets every month, and the cost of the basket is compared with the cost of the same basket a year earlier. The percentage change is the inflation rate.",
          "India has two main official measures. The Consumer Price Index (CPI) follows what households pay, and its all-India figure comes from the Ministry of Statistics and Programme Implementation every month. The Wholesale Price Index (WPI), published by the Office of the Economic Adviser in the Commerce Ministry, follows prices at the wholesale stage and covers goods but not services. The two often move differently, because a rise in the price of a raw material takes time to reach the shop shelf, and some of it never does.",
        ],
      },
      {
        heading: 'Why food matters so much',
        paragraphs: [
          "Food and beverages have historically made up close to half of the Indian CPI basket, far more than in rich countries, so the price of vegetables, pulses and cereals can swing the headline number. A poor monsoon, or a spike in the price of onions or tomatoes, can lift inflation for a few months even when the rest of the economy is calm.",
          "That is why analysts also quote core inflation, which leaves out food and fuel, to see the underlying trend. If headline inflation is high only because of vegetables and core is steady, the pressure is likely to fade with the next harvest. If core is rising too, price pressure is more widespread.",
        ],
      },
      {
        heading: 'What the RBI does about it',
        paragraphs: [
          "Since 2016 India has run a flexible inflation-targeting framework. The government sets the target, and the Reserve Bank of India's six-member Monetary Policy Committee decides the policy interest rate with that target in mind. The target has been 4 per cent, with a tolerance band of 2 to 6 per cent. If inflation stays outside the band for three consecutive quarters, the RBI must report to the government on why, and on what it will do.",
          "Raising the policy rate makes borrowing dearer, which cools spending and, over time, price pressure. Lowering it does the opposite. The rate also has to be weighed against growth, so the committee is balancing two aims at once. Our guide to the repo rate explains how a decision travels to loans and deposits.",
        ],
      },
      {
        heading: 'What inflation does to your money',
        paragraphs: [
          "The useful way to think about inflation is as a tax on idle money. What matters for a saver is the real return: roughly the interest earned minus the rate of inflation.",
        ],
        bullets: [
          "Savers: a deposit earning 6.5 per cent while inflation is 5 per cent grows your purchasing power by only about 1.5 per cent a year. If inflation is higher than the interest, the money buys less each year even though the balance grows.",
          "Borrowers: a fixed-rate loan becomes easier to repay in real terms when prices and wages rise, because the instalment stays the same while incomes grow. Lenders lose in that case, which is why they charge more when they expect higher inflation.",
          "Wage earners: a pay rise that is smaller than inflation is a cut in real pay.",
          "People on fixed incomes, such as many pensioners, feel inflation most, which is why some pensions and allowances are linked to price indices.",
        ],
      },
      {
        heading: 'How to read an inflation headline',
        paragraphs: [
          "When a headline says inflation rose to 5.5 per cent, that figure is almost always the year-on-year change: prices this month compared with the same month last year, not with last month. A fall in the inflation rate does not mean prices fell; it means they are rising more slowly. Prices that actually fall across the economy are called deflation, which is rare and brings problems of its own.",
          "Check which measure is being quoted (CPI or WPI, headline or core, all-India or rural or urban), and remember that the figure is an average. Your own inflation depends on what you buy: a household that spends most of its budget on food and rent feels a different rate from one that spends mainly on travel and electronics.",
        ],
      },
    ],
  },

  {
    slug: 'how-the-repo-rate-works',
    title: 'How the repo rate works, and why it reaches your loan EMI',
    topic: 'finance',
    summary:
      "The RBI's repo rate is the base of India's interest rates. What it is, who decides it, and how a change travels to home loans and deposits.",
    published: '2026-11-10',
    updated: '2026-11-10',
    disclaimer: 'money',
    related: ['what-is-inflation', 'how-the-union-budget-works'],
    intro: [
      "Every few weeks the news carries a phrase that sounds technical: the Reserve Bank of India has kept the repo rate unchanged, or cut it by 25 basis points. Behind it is the most important lever India's central bank has over the cost of money.",
      "The repo rate is the interest rate at which the RBI lends money to commercial banks for short periods, against government securities as collateral. Repo is short for repurchase agreement: the bank sells securities to the RBI today and agrees to buy them back a little later at a slightly higher price. The difference is the interest.",
    ],
    keyPoints: [
      "The repo rate is the rate at which the RBI lends short-term money to banks; it anchors the whole structure of interest rates.",
      "A six-member Monetary Policy Committee decides it, with the aim of keeping inflation near its target while supporting growth.",
      "Floating-rate loans linked to the repo rate respond within about three months; fixed deposit rates adjust more slowly.",
    ],
    sections: [
      {
        heading: 'Who decides, and how often',
        paragraphs: [
          "The rate is set by the Monetary Policy Committee, which has six members: three from the RBI, including the Governor, who chairs it, and three outside experts appointed by the central government. By law it must meet at least four times a year, and in practice the RBI publishes a calendar of meetings. Decisions are taken by majority vote, and the Governor has a casting vote if the committee is evenly split. The minutes are published afterwards, which is why headlines sometimes report a split vote.",
          "The committee works to an inflation target set by the government, 4 per cent with a tolerance band of 2 to 6 per cent. A cut in the repo rate is more likely when inflation is comfortably inside the band and growth needs support; a rise, or a pause, is more likely when prices are rising faster than the target.",
        ],
      },
      {
        heading: 'The other rates around the repo rate',
        paragraphs: [
          "The RBI manages the day-to-day supply of money in the banking system, called liquidity, through a corridor of rates. The repo rate sits in the middle. Below it is the Standing Deposit Facility rate, the rate at which banks can park surplus money with the RBI. Above it is the Marginal Standing Facility rate, the price at which banks can borrow overnight in an emergency. The gap on each side has usually been 0.25 percentage points.",
          "A bank that is short of cash for a night will not accept a rate far above the corridor, and one with spare cash will not lend below its floor, so overnight money-market rates stay close to the repo rate. Everything else is priced off those short-term rates.",
        ],
      },
      {
        heading: 'From the repo rate to your EMI',
        paragraphs: [
          "Since October 2019, banks have had to link new floating-rate home, car and small-business loans to an external benchmark, and many use the repo rate. Such loans are priced as the benchmark plus a fixed spread, and the rate must be reset at least once every three months. A change in the repo rate therefore reaches most new borrowers quickly.",
          "As an illustration, take a ₹50 lakh home loan for 20 years. At 8.5 per cent the monthly instalment is about ₹43,400. If the rate falls by 0.25 percentage points to 8.25 per cent, the instalment falls to about ₹42,600, a saving of roughly ₹800 a month. Many borrowers choose to keep paying the old amount, which shortens the loan instead.",
        ],
        example:
          "₹50,00,000 for 20 years\n8.50% a year  ->  about ₹43,400 a month\n8.25% a year  ->  about ₹42,600 a month\nDifference     ->  roughly ₹800 a month",
      },
      {
        heading: 'Deposits, bonds and the rupee',
        paragraphs: [
          "Fixed deposit rates follow the repo rate too, but more slowly and not one for one, because banks adjust them according to how much money they need to raise. Government bond yields react almost at once, and often move in advance, when investors expect a change. The rate can also affect the rupee: higher rates in India relative to the rest of the world make rupee assets more attractive to foreign investors, other things being equal.",
          "None of this is automatic. The effect of a rate change takes months to work through to prices and growth, which is why central banks try to act on where inflation is heading, not on where it is today.",
        ],
      },
      {
        heading: 'How to read a repo-rate headline',
        paragraphs: [
          "A basis point is one hundredth of a percentage point, so a cut of 25 basis points is a cut of 0.25 points, from 6.50 per cent to 6.25 per cent, for example. Status quo means no change. The stance is the committee's signal about direction: accommodative leans towards lower rates, neutral keeps both options open, and withdrawal of accommodation leans towards tightening.",
          "Look also at what the committee says about its inflation and growth forecasts, because the next decision depends on them more than on the last one.",
        ],
      },
    ],
  },

  {
    slug: 'how-the-union-budget-works',
    title: 'How the Union Budget works, from the speech to the Finance Act',
    topic: 'finance',
    summary:
      "A plain-language walk through India's Union Budget: what is in it, how Parliament passes it, and what deficit and allocation really mean.",
    published: '2026-11-10',
    updated: '2026-11-10',
    disclaimer: 'money',
    related: ['what-is-inflation', 'how-the-repo-rate-works'],
    intro: [
      "Every year, usually on 1 February, the Finance Minister stands up in the Lok Sabha and presents the government's plan for the coming financial year, which runs from 1 April to 31 March. The speech is the part that makes the news, but the Budget is really a bundle of documents and a law-making process that takes weeks.",
      "The Constitution calls it the Annual Financial Statement (Article 112): an estimate of what the Union government expects to receive and to spend in the year. It becomes binding only after Parliament has passed it.",
    ],
    keyPoints: [
      "The Budget estimates what the Union government will raise and spend in the next financial year, and becomes law only when Parliament passes it.",
      "Two kinds of numbers matter: what comes in (taxes, other income, borrowing) and what goes out (interest, subsidies, defence, schemes, transfers to states).",
      "The fiscal deficit, spending minus income that is not borrowing, tells you how much the government must borrow.",
    ],
    sections: [
      {
        heading: 'What is in the Budget',
        paragraphs: [
          "On the receipts side the government counts tax revenue (income tax, corporation tax, GST, customs and excise duties), non-tax revenue (such as dividends from the Reserve Bank and public sector companies) and capital receipts, which include borrowing and the sale of government stakes.",
          "On the spending side there is a difference between revenue expenditure, the day-to-day cost of government such as salaries, pensions, subsidies and interest, and capital expenditure, which creates assets such as roads, railways and defence equipment. A large share of the money raised by the Union government is not spent by it at all but passed to the states under the recommendations of the Finance Commission.",
        ],
      },
      {
        heading: 'How Parliament passes it',
        paragraphs: [
          "After the speech there is a general discussion. Parliament then breaks, and the standing committees examine the demands for grants of each ministry in detail. When the House meets again, the Lok Sabha votes on the demands for grants, and an Appropriation Bill authorises the money to be taken from the Consolidated Fund of India. A separate Finance Bill gives legal effect to the tax proposals.",
          "These are money bills, which are introduced only in the Lok Sabha. The Rajya Sabha may discuss them and return them within 14 days with recommendations, but it cannot amend or reject them, and the Lok Sabha may accept or ignore its suggestions. The process must be finished before 1 April. In an election year the government usually presents an interim budget and asks for a vote on account, which lets it spend for a few months until the new government presents a full Budget.",
        ],
      },
      {
        heading: 'Deficits, explained',
        paragraphs: [
          "The revenue deficit is the amount by which revenue expenditure exceeds revenue receipts. The fiscal deficit is the broadest measure: total expenditure minus total receipts that are not borrowing, so it equals what the government has to borrow in the year. The primary deficit is the fiscal deficit minus interest payments, and shows how much of the borrowing is for new spending rather than for paying interest on old debt.",
          "Deficits are usually quoted as a percentage of GDP, the value of everything the economy produces in a year, so that they can be compared across years and countries. The Fiscal Responsibility and Budget Management Act of 2003 requires the government to follow a declining path for its deficits. Heavy government borrowing matters because it competes with private borrowers for savings and can push up interest rates, and because interest on past debt takes a growing share of each year's spending.",
        ],
      },
      {
        heading: 'Budget estimates, revised estimates and actuals',
        paragraphs: [
          "For every item the Budget documents show three numbers: the actual spending of two years ago, the revised estimate for the current year, and the budget estimate for the coming year. Comparing them tells you whether a ministry spent what it was given.",
          "An allocation is permission to spend, not money already spent, and not every rupee allocated is used. When a headline says a scheme's allocation has risen by 20 per cent, ask what it was compared with: last year's budget estimate, or what was actually spent. Also remember that a rise in rupee terms may be smaller than the rise in prices.",
        ],
      },
      {
        heading: 'The states have budgets too',
        paragraphs: [
          "India is a federation, and each state presents its own budget, usually in February or March. States raise some taxes themselves, share in GST, and receive a portion of Union taxes. The Union Budget is the largest single financial document, but a great deal of spending on health, education, police and local services is decided in the states.",
        ],
      },
    ],
  },

  {
    slug: 'sensex-and-nifty-explained',
    title: "Sensex and Nifty explained: what India's market indices measure",
    topic: 'stocks',
    summary:
      'What the Sensex and the Nifty 50 are, how they are calculated, and why a rise in the index does not mean every share is rising.',
    published: '2026-11-10',
    updated: '2026-11-10',
    disclaimer: 'money',
    related: ['how-to-read-a-pe-ratio', 'how-an-ipo-works-in-india'],
    intro: [
      "When the news says the market fell 600 points, it usually means the Sensex or the Nifty 50. An index is a single number that summarises how a basket of shares is doing, so that one figure can stand for the market.",
      "Neither index is the market. Each follows a small group of the largest listed companies. Knowing how they are built explains most of the puzzles in a market report, such as why the index can rise while most shares fall.",
    ],
    keyPoints: [
      "The Sensex follows 30 large companies listed on the BSE; the Nifty 50 follows 50 large companies listed on the NSE.",
      "Both weight companies by free-float market capitalisation, so the biggest companies move the index the most.",
      "An index shows how large companies did, not how your own portfolio did, and you cannot buy an index directly.",
    ],
    sections: [
      {
        heading: 'Two exchanges, two indices',
        paragraphs: [
          "The Bombay Stock Exchange (BSE), set up in 1875, is Asia's oldest stock exchange. Its index, the Sensex, was first published in 1986, with 1978-79 as its base year and a base value of 100. The National Stock Exchange (NSE) began trading shares in 1994, and its Nifty 50 was introduced in 1996, with 3 November 1995 as its base date and a base value of 1,000.",
          "Index points are not rupees, so the size of a move depends on the level. If the index stands at 75,000, a fall of 600 points is 0.8 per cent. Percentages, not points, are what let you compare one day or one year with another.",
        ],
      },
      {
        heading: 'How an index is calculated',
        paragraphs: [
          "Each company's weight depends on its free-float market capitalisation: the share price multiplied by the number of shares actually available for the public to trade, which leaves out the holdings of promoters and other long-term holders. The index is the combined value of its companies divided by a number called the divisor, scaled to the base value.",
          "The divisor is adjusted whenever something changes the total for reasons other than market prices, such as a company being replaced, a stock split or a rights issue. This is what keeps the index from jumping when nothing has happened to investors' wealth. The exchanges review the list of constituents twice a year, and a company can be dropped if it no longer qualifies on size, liquidity or free float.",
        ],
      },
      {
        heading: 'Why weights matter',
        paragraphs: [
          "Because the indices are weighted by size, a handful of large banks, software companies and energy groups can account for most of the movement. If those heavyweights rise while a majority of the other constituents fall, the index can still finish higher. For this reason, market reports also give the number of advancing and declining shares, which shows how broad a move was.",
          "The composition changes the character of an index over time. A heavy weight in financial companies, for instance, makes the index sensitive to interest rates and credit growth. Equal-weight versions of the Nifty exist for investors who want each company to count the same.",
        ],
      },
      {
        heading: 'Other indices you will meet',
        paragraphs: [
          "The Nifty Next 50 follows the next largest companies after the Nifty 50, and the Nifty Midcap and Smallcap indices follow smaller ones. The Nifty Bank index follows the major banks and is quoted on its own because derivatives trade heavily on it. The India VIX is a different kind of number: it measures how much movement the options market expects over the next 30 days, and is often called the fear gauge.",
        ],
      },
      {
        heading: 'How to read a market report',
        paragraphs: [
          "Look for the percentage change rather than the points, and for whether the figure is the close or a number during the day. A record high is a nominal record, which prices in no inflation, so a long-run comparison should consider both. Price indices also leave out dividends; total return indices include them and are the fairer yardstick for long-term returns.",
          "Index funds and exchange-traded funds that track these indices let investors own a slice of the whole basket at low cost, but the index itself is only a measure. As with every guide on Plax, this is general information, not advice on what to buy or sell.",
        ],
      },
    ],
  },

  {
    slug: 'how-an-ipo-works-in-india',
    title: 'How an IPO works in India, from filing to listing',
    topic: 'stocks',
    summary:
      'A step-by-step look at an initial public offering in India: SEBI filings, price bands, categories of investors, allotment and listing.',
    published: '2026-11-10',
    updated: '2026-11-10',
    disclaimer: 'money',
    related: ['how-to-read-a-pe-ratio', 'sensex-and-nifty-explained', 'how-startup-funding-rounds-work'],
    intro: [
      "An initial public offering (IPO) is the first time a company sells its shares to the public and lists them on a stock exchange. It is how a private company raises money from many investors at once, and how early investors and founders can sell part of their holdings.",
      "In India the process is supervised by the Securities and Exchange Board of India (SEBI). Knowing the steps makes IPO headlines, with their price bands, subscription numbers and listing gains, much easier to read.",
    ],
    keyPoints: [
      "A company files a draft offer document with SEBI and may open its issue only after SEBI has examined it.",
      "Shares are offered within a price band; investors bid in categories, and allotment follows fixed rules if the issue is oversubscribed.",
      "Listing normally happens within three working days of the issue closing, and the listing price can be above or below the issue price.",
    ],
    sections: [
      {
        heading: 'Fresh issue and offer for sale',
        paragraphs: [
          "An IPO can consist of a fresh issue, in which the company creates new shares and receives the money, an offer for sale, in which existing shareholders sell some of theirs and receive the money, or both. The difference matters. Money from a fresh issue funds the business, for example to repay debt or to build capacity. Money from an offer for sale goes to the sellers, and the company gets none of it. The offer document states the split and what the fresh money will be used for, under the heading objects of the issue.",
        ],
      },
      {
        heading: 'The paperwork',
        paragraphs: [
          "The company appoints merchant bankers, called book running lead managers, who help prepare a Draft Red Herring Prospectus and file it with SEBI. SEBI reviews it and issues observations. Once the company has addressed them, it files the Red Herring Prospectus with the Registrar of Companies. This long document sets out the business, its financial statements, its promoters, pending litigation and, importantly, the risk factors.",
          "The document is public. For any IPO you are considering, the sections on risk factors, objects of the issue and financial information are the most useful to read.",
        ],
      },
      {
        heading: 'Price band and bidding',
        paragraphs: [
          "The company announces a price band, a range within which investors may bid, at least two working days before the issue opens. The issue stays open for three working days. The day before it opens, a group of large institutions called anchor investors is allotted shares, which gives an early indication of institutional demand.",
          "Bidders fall into categories. In a typical issue by a profitable company, not more than half is reserved for qualified institutional buyers such as mutual funds and insurers, not less than 15 per cent for non-institutional investors who bid for more than ₹2 lakh, and not less than 35 per cent for retail investors who apply for up to ₹2 lakh. Retail applicants use their bank account or a UPI mandate; the amount is blocked, not debited, until the shares are allotted.",
        ],
      },
      {
        heading: 'Allotment',
        paragraphs: [
          "When the issue closes, the registrar adds up the bids. A category is oversubscribed when investors have asked for more shares than were offered. If the retail portion is oversubscribed, allotment is made by lottery in the minimum lot size, so some applicants receive shares and others receive none. Blocked money is released for those who are not allotted anything, and shares are credited to the demat accounts of those who are.",
        ],
      },
      {
        heading: 'Listing day and listing gains',
        paragraphs: [
          "Shares are listed on the BSE, the NSE or both, normally within three working days after the issue closes. The opening price is found through a short pre-open auction. A listing gain is the difference between the listing price and the issue price. It is not guaranteed: some shares list well above the issue price, and some below.",
          "The unofficial grey market premium quoted in the press is just gossip between traders. It is not regulated and is often wrong. Rules also lock in part of the pre-IPO holdings for a period, to stop early holders selling straight away, and the end of a lock-in can affect the price.",
        ],
      },
      {
        heading: 'Questions to ask before applying',
        paragraphs: [
          "What does the company actually sell, and how does it make a profit? What will the fresh money be used for? How much of the issue is an offer for sale, and who is selling? How does the valuation compare with similar listed companies, for example on the price-to-earnings ratio? What do the risk factors say? Nobody can predict a listing price, and this guide is general information, not a recommendation for or against any issue.",
        ],
      },
    ],
  },

  {
    slug: 'how-to-read-a-pe-ratio',
    title: 'How to read a P/E ratio, and when not to trust it',
    topic: 'stocks',
    summary:
      'The price-to-earnings ratio is the most quoted number in stock market news. What it measures, how to compare it, and where it misleads.',
    published: '2026-11-10',
    updated: '2026-11-10',
    disclaimer: 'money',
    related: ['sensex-and-nifty-explained', 'how-an-ipo-works-in-india'],
    intro: [
      "The stock trades at 25 times earnings. The price-to-earnings ratio, or P/E, is a shorthand for how much investors are paying for each rupee of a company's yearly profit. It is the most quoted valuation number in market news, and one of the most misused.",
      "A P/E ratio is not a verdict. It is a question: why is this share priced at this multiple? The answer is where the analysis begins.",
    ],
    keyPoints: [
      "P/E equals the share price divided by earnings per share.",
      "A high P/E can mean high expectations of growth, or an expensive share; a low P/E can mean a bargain, or a business in trouble.",
      "Compare like with like: the same sector, similar growth, and the company's own history.",
    ],
    sections: [
      {
        heading: 'The arithmetic',
        paragraphs: [
          "Earnings per share (EPS) is the company's profit after tax divided by the number of its shares. If a company earns ₹1,200 crore a year and has 100 crore shares, its EPS is ₹12. If the share price is ₹300, the P/E is 300 divided by 12, or 25. Investors are paying ₹25 for each ₹1 of yearly profit. The same figure can be found by dividing the company's market value by its yearly profit.",
          "The inverse of the P/E is the earnings yield: 1 divided by 25 is 4 per cent. It lets you compare a share with, say, a bank deposit or a government bond, with the important difference that a company's earnings can grow, and can also fall.",
        ],
        example: "Profit after tax   ₹1,200 crore\nShares             100 crore\nEPS                ₹1,200 / 100 = ₹12\nShare price        ₹300\nP/E                300 / 12 = 25\nEarnings yield     12 / 300 = 4%",
      },
      {
        heading: 'Trailing and forward P/E',
        paragraphs: [
          "A trailing P/E uses the earnings of the last four quarters, which have been reported and can be checked. A forward P/E uses analysts' estimates of the coming year, which reflect expectations and can be wrong. Data providers also differ on whether they use standalone or consolidated profit, so the same share can show two P/Es on two websites. When comparing, make sure the figures come from the same source and the same basis.",
        ],
      },
      {
        heading: 'What a P/E can tell you',
        paragraphs: [
          "Investors pay more for earnings they expect to grow quickly, so fast-growing companies usually trade on higher multiples than slow-growing ones. Sectors also differ for structural reasons: a software company, a bank and a cement producer have different growth, capital needs and risk, and their usual P/Es differ accordingly. The exchanges publish the P/E of the broad indices, which gives a rough sense of whether the market as a whole is priced richly or cheaply compared with its own history.",
        ],
      },
      {
        heading: 'Where the P/E misleads',
        paragraphs: ["The ratio breaks down in predictable situations."],
        bullets: [
          "Tiny or negative earnings. A company that has just reached profit may show a P/E of several hundred, and a loss-making company has no meaningful P/E at all.",
          "One-off items. A profit boosted by the sale of an asset, or cut by a one-time charge, distorts the ratio for a year.",
          "Cyclical businesses. A steel or commodity company often has a low P/E at the top of the cycle, when profits are at a peak, and a high one at the bottom, so the signal is the reverse of what it seems.",
          "Debt. Two companies with the same P/E can have very different levels of borrowing. Measures such as enterprise value to EBITDA take debt into account.",
          "Banks and insurers. Their profits depend on provisions and accounting choices, so price to book value is often used alongside P/E.",
        ],
      },
      {
        heading: 'A cautious way to use it',
        paragraphs: [
          "Treat the P/E as a prompt for further questions. Is it high because growth is strong, or because the price has run ahead of the business? Compare it with the same company over three to five years, and with two or three of its closest rivals. Read the company's own results for revenue growth, margins, debt and cash flow. And remember that no single ratio decides whether a share is a good investment. This guide is general education, not investment advice.",
        ],
      },
    ],
  },

  {
    slug: 'how-startup-funding-rounds-work',
    title: 'How startup funding rounds work, from seed to Series C',
    topic: 'business',
    summary:
      'Pre-seed, seed, Series A, B and C: what each funding stage means, how valuation and dilution work, and what the headline numbers hide.',
    published: '2026-11-10',
    updated: '2026-11-10',
    related: ['how-an-ipo-works-in-india', 'how-to-read-a-pe-ratio'],
    intro: [
      "Startup X raises $40 million in a Series B. Funding headlines are a staple of business news, and the vocabulary can be opaque. Here is what the stages mean, in the order that a typical venture-backed company meets them.",
      "A funding round is a sale of a slice of the company in exchange for money. Everything else, from the names of the stages to the size of the cheques, follows from how much risk the investors are taking at each point.",
    ],
    keyPoints: [
      "Each round sells part of the company, so founders and earlier investors own a smaller share afterwards (dilution).",
      "Stage names describe maturity: seed for an early product, Series A for a business that is starting to work, later rounds for scaling up.",
      "The valuation in a headline is a negotiated price for the company, not a measure of its revenue or profit.",
    ],
    sections: [
      {
        heading: 'The stages',
        paragraphs: [
          "Pre-seed and angel rounds are the first money, often from the founders' friends, family and individual investors known as angels, used to build a first version. A seed round, usually the first from professional investors, pays for the product and the first customers. A Series A round comes when the company can show that people want what it sells and that the business can be repeated; it pays for a team and for finding customers at scale. Series B and later rounds fund growth: new cities or countries, new products, bigger sales teams.",
          "The letters are conventions, not rules, and the sizes of cheques differ by country and by year. Between rounds there are also bridge rounds, which keep a company going until its next big raise, and venture debt, which is a loan rather than a sale of shares.",
        ],
      },
      {
        heading: 'Valuation and dilution',
        paragraphs: [
          "The pre-money valuation is what the company is deemed to be worth before the new money arrives, and the post-money valuation is that figure plus the new money. If investors put in ₹10 crore at a pre-money valuation of ₹40 crore, the post-money valuation is ₹50 crore, and the new investors own 20 per cent.",
          "That 20 per cent comes from everybody else. A founder who owned 60 per cent before the round owns 48 per cent afterwards, which is 60 per cent of the remaining 80. Companies also set aside a pool of shares for employee stock options, which dilutes the others too. Founders accept dilution because a smaller share of a growing company can be worth more than all of a stalled one.",
        ],
        example: "Pre-money valuation   ₹40 crore\nNew investment        ₹10 crore\nPost-money valuation  ₹50 crore\nNew investors own     10 / 50 = 20%\nFounder: 60% x (1 - 0.20) = 48%",
      },
      {
        heading: 'What investors get',
        paragraphs: [
          "Investors usually receive preferred shares, which carry rights that ordinary shares lack. A liquidation preference means they are repaid first if the company is sold. Others include a seat on the board, protection against future rounds at a lower price, and a say in major decisions. These terms are set out in a term sheet before the final agreements are signed.",
          "Early rounds are sometimes done with a convertible instrument, a promise of shares in the future at the price of the next round, instead of shares today. In India, rounds are often structured with compulsorily convertible preference shares, which convert into ordinary shares at a set time or event.",
        ],
      },
      {
        heading: 'Unicorns, down rounds and runway',
        paragraphs: [
          "A unicorn is a privately held startup valued at $1 billion or more, a term coined by the investor Aileen Lee in 2013. A down round is a raise at a lower valuation than the one before, which is painful for existing shareholders. Runway is the number of months a company can operate before it runs out of cash, found by dividing the cash in the bank by the monthly burn rate, the amount of cash it loses each month. A company with 18 months of runway has time to fix problems; one with 4 months is negotiating from weakness.",
        ],
      },
      {
        heading: 'How to read a funding headline',
        paragraphs: [
          "Check who led the round, since a well-known lead investor is a signal in itself, and whether the valuation is stated or only reported from sources. Check whether the headline figure includes secondary sales, where existing shareholders cash out part of their stake, because that money does not go to the company. Money announced is not always money received: funding is sometimes paid in instalments tied to milestones. Finally, ask what the company will do with the money, because that tells you more about the business than the size of the number.",
        ],
      },
    ],
  },
]
