import { BUILT_IN_TOPICS, NEWS_TOPIC, sameTopic, topicById, topicLabel } from '../topic'

describe('the built-in topics', () => {
  it('are the 18 the app was made with, news first, each with an emoji and both names', () => {
    expect(BUILT_IN_TOPICS).toHaveLength(18)
    expect(BUILT_IN_TOPICS[0].id).toBe('news')
    expect(NEWS_TOPIC.id).toBe('news')
    expect(new Set(BUILT_IN_TOPICS.map((topic) => topic.id)).size).toBe(18)
    for (const topic of BUILT_IN_TOPICS) {
      expect(topic.emoji.length).toBeGreaterThan(0)
      expect(topic.en.length).toBeGreaterThan(0)
      expect(topic.hi.length).toBeGreaterThan(0)
    }
  })

  it('are the topics the website lists in public/app-config.json, in the same order', () => {
    const published = (require('../../../../public/app-config.json') as { topics: { id: string }[] }).topics.map((topic) => topic.id)
    expect(BUILT_IN_TOPICS.map((topic) => topic.id)).toEqual(published)
  })

  it('are named in the language the screen is in', () => {
    expect(topicLabel(NEWS_TOPIC, 'en')).toBe('Headlines')
    expect(topicLabel(NEWS_TOPIC, 'hi')).not.toBe('Headlines')
    expect(topicLabel({ id: 'x', emoji: '*', en: 'Only English', hi: '' }, 'hi')).toBe('Only English')
  })

  it('are the same topic when the ids are, whatever the names', () => {
    expect(sameTopic(NEWS_TOPIC, { id: 'news', emoji: '?', en: 'Other', hi: 'अन्य' })).toBe(true)
    expect(sameTopic(NEWS_TOPIC, BUILT_IN_TOPICS[1])).toBe(false)
    expect(topicById(BUILT_IN_TOPICS, 'stocks')?.id).toBe('stocks')
    expect(topicById(BUILT_IN_TOPICS, 'nothing')).toBeUndefined()
  })
})
