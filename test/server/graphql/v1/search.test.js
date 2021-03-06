import Index from 'algoliasearch/src/Index';
import { expect } from 'chai';
import config from 'config';
import gql from 'fake-tag';
import { describe, it } from 'mocha';
import sinon from 'sinon';

import * as store from '../../../stores';
import * as utils from '../../../utils';

describe('server/graphql/v1/search', () => {
  let sandbox;
  const hits = [
    {
      id: 5,
      name: 'Open Source Collective',
      description: 'This is the Open Source Collective.',
      currency: 'USD',
      slug: 'test-collective',
      mission: 'test mission',
      tags: ['open', 'test', 'collective'],
      locationName: 'Testland',
      image: '',
      balance: 1300,
      yearlyBudget: 3600,
      backersCount: 130,
    },
  ];
  const nbHits = 10;

  before(async () => {
    await utils.resetTestDB();
    sandbox = sinon.createSandbox();

    // Given a random collective
    await store.newCollectiveWithHost('A random collective', 'USD', 'USD', 5);
    // Given the open source collective host
    const { hostCollective } = await store.newHost('Open Source Collective', 'USD', 5);
    await hostCollective.update({
      description: 'This is the Open Source Collective.',
    });
  });

  describe('With Algolia', () => {
    beforeEach(() => {
      // Make sure the library is constructed
      config.algolia = config.algolia || {};
      config.algolia.appId = config.algolia.appId || 'x';
      config.algolia.appKey = config.algolia.appKey || 'y';
      config.algolia.index = config.algolia.index || 'z';

      sandbox.stub(Index.prototype, 'search');
      Index.prototype.search.returns(Promise.resolve({ hits, nbHits }));
    });

    afterEach(() => {
      if (config.algolia.appId === 'x') {
        delete config.algolia.appId;
      }
      if (config.algolia.appKey === 'y') {
        delete config.algolia.appKey;
      }
      if (config.algolia.index === 'z') {
        delete config.algolia.index;
      }

      sandbox.restore();
    });

    it('returns list of CollectiveSearch types', async () => {
      const collectiveSearchQuery = gql`
        query CollectiveSearch($term: String!) {
          search(term: $term, useAlgolia: true) {
            collectives {
              id
            }
          }
        }
      `;

      const result = await utils.graphqlQuery(collectiveSearchQuery, { term: 'open' });

      expect(
        Index.prototype.search.firstCall.calledWith({
          query: 'open',
          length: 20,
          offset: 0,
        }),
      ).to.be.true;
      expect(result.data.search).to.deep.equal({
        collectives: [{ id: hits[0].id }],
      });
    });

    it('accepts limit and offset arguments', async () => {
      const collectiveSearchQuery = gql`
        query CollectiveSearch($term: String!, $limit: Int!, $offset: Int!) {
          search(term: $term, limit: $limit, offset: $offset, useAlgolia: true) {
            collectives {
              id
              name
              description
            }
            total
            limit
            offset
          }
        }
      `;

      const result = await utils.graphqlQuery(collectiveSearchQuery, {
        term: 'open',
        limit: 20,
        offset: 0,
      });

      expect(
        Index.prototype.search.firstCall.calledWith({
          query: 'open',
          length: 20,
          offset: 0,
        }),
      ).to.be.true;

      expect(result.data.search).to.deep.equal({
        collectives: [
          {
            id: hits[0].id,
            name: hits[0].name,
            description: hits[0].description,
          },
        ],
        total: nbHits,
        limit: 20,
        offset: 0,
      });
    });
  });
});
