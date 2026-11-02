import test from 'node:test'
import assert from 'node:assert/strict'
import { agreedParagraphs, holds, indexBody, mayBeDateline, stripDateline } from './dateline.ts'

const BODY = 'Tata Trusts board member Darius Khambata has alleged that directors of Tata Sons sullied the image of the company.'
const CENTRE = 'The Centre has notified rules for grievance redressal under the new employment law, the Ministry said on Monday.'

test('a line that says where a story was written, and can be nothing else, is taken off the front', () => {
  for (const written of [
    'Mumbai: ', 'MUMBAI: ', 'Our Bureau Mumbai: ', '( for web) Our Bureau Mumbai:  ', 'Special Correspondent - ', '( for web) ',
    'Hyderabad, Nov 2: ', 'New Delhi, Nov 2 (PTI) ', 'LONDON (Reuters) - ', 'Washington (AP) ', 'NEW DELHI (AFP) \u2014 ',
  ]) assert.equal(stripDateline(written + BODY), BODY, written)
})

test('a known place in capitals before a sentence is a dateline', () => {
  for (const written of ['KOCHI ', 'CHENNAI ', 'COIMBATORE ', 'PUDUKOTTAI ', 'KOTTAYAM ', 'UDHAGAMANDALAM ', 'NEW DELHI ']) {
    assert.equal(stripDateline(written + BODY), BODY, written)
    assert.equal(stripDateline(written + CENTRE), CENTRE, written)
  }
})

test('a known place in capitalised words is a dateline only when a word that begins a sentence follows', () => {
  for (const written of ['New Delhi ', 'Delhi ', 'Hyderabad ', 'London ']) {
    assert.equal(stripDateline(written + CENTRE), CENTRE, written)
    assert.equal(stripDateline(written + 'In a statement on Monday, the airline said it would resume flights from the city next week.'),
      'In a statement on Monday, the airline said it would resume flights from the city next week.')
  }
})

test('a credit and a place and a date, with no mark, before a sentence: the way BusinessLine begins a story', () => {
  const talks = 'In high-level official talks in Brussels, India and the European Union agreed to maintain close contact on all open issues.'
  for (const written of ['Our Bureau New Delhi, November 2 ', 'Our Bureau Mumbai, Nov 2 ', 'New Delhi, November 2 ', 'Special Correspondent Chennai, Nov. 2 ', 'Mumbai, Nov 2 ']) {
    assert.equal(stripDateline(written + talks), talks, written)
  }
  // A credit that no dateline follows is the start of a sentence, and a date is not a place.
  for (const kept of [
    'Our Bureau chief said on Monday that the new rules would take effect next month, officials added to the report.',
    'Special Representative Ajay Banga said on Monday that the fund would grow by a third over the next five years.',
    'Our Correspondent in Kabul said on Monday that the border crossing had been closed since the early morning.',
    'May 3 The meeting was moved to the next week, the organisers told the members of the committee on Monday.',
  ]) assert.equal(stripDateline(kept), kept)
})

test('a note to the editors in brackets goes, and the dateline behind it with it: the way a BusinessLine page begins', () => {
  const note = '(Highlighted paras can be removed for Print. Please retain those for online) '
  const story = 'With the tightening of the monetary policy by the Reserve Bank of India and interest rates moving up, HDFC Life is clearly witnessing a preference.'
  assert.equal(stripDateline(`${note}Kolkata ${story}`), story)
  assert.equal(stripDateline(`${note}${story}`), story)
  assert.equal(stripDateline(`(Note: the figures are provisional) New Delhi ${CENTRE}`), CENTRE)
  // A bracket that is not a note is the story's own.
  const spoken = '(Reuters) was not yet able to confirm the report, which the ministry in Delhi called baseless on Monday evening.'
  assert.equal(stripDateline(spoken), spoken)
})

test('what only looks like a dateline is kept: a force, a body, a club, a company, a title, a name', () => {
  for (const kept of [
    'Delhi Police said on Monday that the accused had been arrested from a hotel near the airport after a two-day search.',
    'DELHI POLICE said on Monday that the accused had been arrested from a hotel near the airport after a two-day search.',
    'Mumbai Police have registered a case against the organisers of the event for violating the permitted noise limits.',
    'Chennai Corporation will begin clearing the stormwater drains from Monday, officials said, ahead of the monsoon.',
    'Hyderabad Metro Rail will extend its services by an hour on weekends from next month, the managing director said.',
    'New York Times reporters were among those detained at the border on Sunday, the newspaper said in a statement.',
    'Mumbai Indians won the toss and chose to bat first at the Wankhede Stadium on a warm Sunday evening in the city.',
    'London Stock Exchange Group said on Monday that it expects its full-year profit to be above the analysts\u2019 forecasts.',
    'Delhi University has extended the last date for admissions to its undergraduate courses by a week, officials said.',
    'Pune Municipal Corporation officials said the water supply would be affected in several areas on Thursday morning.',
    'AIIMS Delhi doctors said on Monday that the patient was stable and was likely to be discharged in a few days.',
    'IRCTC Chairman and Managing Director said on Monday that the new booking system would be rolled out next month.',
    'NCERT Director said on Monday that the revised textbooks would reach schools before the new academic year begins.',
    'INFOSYS Ltd said on Monday that it had won a large multi-year contract from a European bank for its cloud unit.',
    'RELIANCE Industries said on Monday that its retail arm had opened two hundred new stores during the quarter.',
    'UNICEF Executive Director Catherine Russell said on Monday that children in the region are at risk of famine.',
    'NASA scientists said on Monday that the cluster is among the oldest known stellar remnants in the galaxy.',
    'Trump: I will sign the order on Monday, and the tariffs will take effect before the end of the week, he said.',
    'Explained: Why the Supreme Court set aside the order of the Rajasthan State Election Commission on Monday.',
    "Tamil Nadu's economic performance under the new government has come under attack from the opposition on Monday.",
    'Hemanth, the 21-year-old accused in the chainsaw attack, was related to the minor victim, sources told India Today.',
    'Sources said the minister would resign on Monday, and that a successor had already been chosen by the party.',
    'Mumbai - Pune flights were cancelled on Monday because of heavy rain, the airport said in a short statement.',
  ]) assert.equal(stripDateline(kept), kept)
})

test('a place that is not on the list is left where it is, and is only a doubt for the page to settle', () => {
  const unknown = `RAMESWARAM ${BODY}`
  assert.equal(stripDateline(unknown), unknown)
  assert.equal(mayBeDateline(unknown), true)
})

test('a dateline is only a doubt when something is left that could be one after what is sure has been taken off', () => {
  for (const doubtful of [
    `RAMESWARAM ${BODY}`,
    'AIIMS Delhi doctors said on Monday that the patient was stable and was likely to be discharged in a few days.',
    'Delhi Police said on Monday that the accused had been arrested from a hotel near the airport after a two-day search.',
    'Trump: I will sign the order on Monday, and the tariffs will take effect before the end of the week, he said.',
  ]) assert.equal(mayBeDateline(doubtful), true, doubtful)
  for (const plain of [CENTRE, BODY, `KOCHI ${CENTRE}`, `New Delhi, Nov 2 (PTI) ${CENTRE}`, 'Sources said the minister would resign on Monday, and that a successor had been chosen.', '']) {
    assert.equal(mayBeDateline(plain), false, plain)
  }
})

test("the page's paragraphs that its structured body also holds are the story without a dateline or a widget", () => {
  const structured = [
    'RAMESWARAM Fishermen from the island said on Monday that the catch had fallen by half since the ban began in April.',
    'The Fisheries Department said that compensation would be paid within two weeks to all registered boat owners.',
  ]
  const widget = 'Zen Technologies stock trades at a trailing P/E of 46.2 against a sector median of 38.1, with a market cap of Rs 21,000 crore.'
  const markup = [
    widget,
    'Fishermen from the island said on Monday that the catch had fallen by half since the ban began in April.',
    'The Fisheries Department said that compensation would be paid within two weeks to all registered boat owners.',
  ]
  assert.deepEqual(agreedParagraphs(structured, markup), markup.slice(1))
  assert.equal(holds(indexBody(structured), widget), false)
})

test('paragraphs agree whatever the case, spacing, dashes and the curl of a quotation mark', () => {
  const structured = ['The minister said \u201cthe\u00a0state will not   bow\u201d \u2014 and added that talks would go on for two more weeks.']
  assert.deepEqual(agreedParagraphs(structured, ['The minister said "the state will not bow" - and added that talks would go on for two more weeks.']), [
    'The minister said "the state will not bow" - and added that talks would go on for two more weeks.',
  ])
  // A paragraph too short to tell from any other never agrees.
  assert.deepEqual(agreedParagraphs(['Yes. The minister said so.'], ['Yes. The minister said so.']), [])
})
