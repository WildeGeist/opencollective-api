import { expect } from 'chai';
import moment from 'moment';

import { loaders } from '../../../../server/graphql/loaders';
import { requiredLegalDocuments, userTaxFormRequiredBeforePayment } from '../../../../server/graphql/loaders/expenses';
import models from '../../../../server/models';
import { LEGAL_DOCUMENT_TYPE } from '../../../../server/models/LegalDocument';
import { fakeCollective, fakeExpense, fakeHost, fakeUser } from '../../../test-helpers/fake-data';
import { resetTestDB } from '../../../utils';

const US_TAX_FORM_THRESHOLD = 600e2;

/** Create a fake host */
const fakeHostWithRequiredLegalDocument = async (hostData = {}) => {
  const host = await fakeHost(hostData);
  const requiredDoc = {
    HostCollectiveId: host.id,
    documentType: 'US_TAX_FORM',
  };

  await models.RequiredLegalDocument.create(requiredDoc);
  return host;
};

describe('server/graphql/loaders/expense', () => {
  before(resetTestDB);

  describe('userTaxFormRequiredBeforePayment', () => {
    const req = {};

    let host, collective;

    before(async () => {
      host = await fakeHostWithRequiredLegalDocument();
      collective = await fakeCollective({ HostCollectiveId: host.id });
    });

    describe('requires user tax form before payment', () => {
      it('when one expense is above threshold', async () => {
        const loader = userTaxFormRequiredBeforePayment({ loaders: loaders(req) });
        const expenseWithUserTaxForm = await fakeExpense({
          amount: US_TAX_FORM_THRESHOLD + 1,
          CollectiveId: collective.id,
          type: 'INVOICE',
        });
        const result = await loader.load(expenseWithUserTaxForm.id);
        expect(result).to.be.true;
      });

      it('when the sum of multiple expenses is above threshold', async () => {
        const user = await fakeUser();
        const loader = userTaxFormRequiredBeforePayment({ loaders: loaders(req) });
        const firstExpense = await fakeExpense({
          amount: US_TAX_FORM_THRESHOLD - 100,
          CollectiveId: collective.id,
          FromCollectiveId: user.CollectiveId,
          UserId: user.id,
          type: 'INVOICE',
        });
        const secondExpense = await fakeExpense({
          amount: 200,
          CollectiveId: collective.id,
          FromCollectiveId: user.CollectiveId,
          UserId: user.id,
          type: 'INVOICE',
        });
        const result1 = await loader.load(firstExpense.id);
        const result2 = await loader.load(secondExpense.id);
        expect(result1).to.be.true;
        expect(result2).to.be.true;
      });

      it('when the form was submitted for past year', async () => {
        const user = await fakeUser();
        const loader = userTaxFormRequiredBeforePayment({ loaders: loaders(req) });
        const expenseWithUserTaxForm = await fakeExpense({
          amount: US_TAX_FORM_THRESHOLD + 100e2,
          CollectiveId: collective.id,
          FromCollectiveId: user.CollectiveId,
          UserId: user.id,
          type: 'INVOICE',
        });
        await models.LegalDocument.create({
          year: parseInt(new Date().toISOString().split('-')) - 1,
          documentType: LEGAL_DOCUMENT_TYPE.US_TAX_FORM,
          documentLink: 'https://opencollective.com/tos',
          requestStatus: 'RECEIVED',
          CollectiveId: user.CollectiveId,
        });
        const result = await loader.load(expenseWithUserTaxForm.id);
        expect(result).to.be.true;
      });
    });

    describe('does not require user tax form before payment', () => {
      it('When under threshold', async () => {
        const loader = userTaxFormRequiredBeforePayment({ loaders: loaders(req) });
        const expenseWithOutUserTaxForm = await fakeExpense({
          amount: US_TAX_FORM_THRESHOLD - 100,
          CollectiveId: collective.id,
          type: 'INVOICE',
        });
        const result = await loader.load(expenseWithOutUserTaxForm.id);
        expect(result).to.be.false;
      });

      it('When legal document has already been submitted', async () => {
        const user = await fakeUser();
        const loader = userTaxFormRequiredBeforePayment({ loaders: loaders(req) });
        const expenseWithUserTaxForm = await fakeExpense({
          amount: US_TAX_FORM_THRESHOLD + 100e2,
          CollectiveId: collective.id,
          FromCollectiveId: user.CollectiveId,
          UserId: user.id,
          type: 'INVOICE',
        });
        await models.LegalDocument.create({
          year: parseInt(new Date().toISOString().split('-')),
          documentType: LEGAL_DOCUMENT_TYPE.US_TAX_FORM,
          documentLink: 'https://opencollective.com/tos',
          requestStatus: 'RECEIVED',
          CollectiveId: user.CollectiveId,
        });
        const result = await loader.load(expenseWithUserTaxForm.id);
        expect(result).to.be.false;
      });

      it('When host does not have requiredLegalDocument', async () => {
        const loader = userTaxFormRequiredBeforePayment({ loaders: loaders(req) });
        const expenseWithOutUserTaxForm = await fakeExpense({ type: 'INVOICE' });
        const result = await loader.load(expenseWithOutUserTaxForm.id);
        expect(result).to.be.false;
      });

      it('When expenses are RECEIPT', async () => {
        const loader = userTaxFormRequiredBeforePayment({ loaders: loaders(req) });
        const expense1 = await fakeExpense({
          type: 'RECEIPT',
          CollectiveId: collective.id,
          amount: US_TAX_FORM_THRESHOLD + 100,
        });
        const result = await loader.load(expense1.id);
        expect(result).to.be.false;
      });

      it('When expenses are not RECEIPT', async () => {
        const loader = userTaxFormRequiredBeforePayment({ loaders: loaders(req) });
        const expense1 = await fakeExpense({
          type: 'INVOICE',
          CollectiveId: collective.id,
          amount: US_TAX_FORM_THRESHOLD + 100,
        });
        const expense2 = await fakeExpense({
          type: 'UNCLASSIFIED',
          CollectiveId: collective.id,
          amount: US_TAX_FORM_THRESHOLD + 100,
        });
        const expense3 = await fakeExpense({
          type: 'FUNDING_REQUEST',
          CollectiveId: collective.id,
          amount: US_TAX_FORM_THRESHOLD + 100,
        });
        const result = await loader.load(expense1.id);
        expect(result).to.be.true;
        const result2 = await loader.load(expense2.id);
        expect(result2).to.be.true;
        const result3 = await loader.load(expense3.id);
        expect(result3).to.be.true;
      });

      it('When expenses were submitted last year', async () => {
        const user = await fakeUser();
        const loader = userTaxFormRequiredBeforePayment({ loaders: loaders(req) });
        const firstExpense = await fakeExpense({
          amount: US_TAX_FORM_THRESHOLD + 1000,
          CollectiveId: collective.id,
          FromCollectiveId: user.CollectiveId,
          UserId: user.id,
          type: 'INVOICE',
          incurredAt: moment(new Date()).subtract(1, 'year').set('month', 11).set('date', 30),
        });
        const secondExpense = await fakeExpense({
          amount: 200,
          CollectiveId: collective.id,
          FromCollectiveId: user.CollectiveId,
          UserId: user.id,
          type: 'INVOICE',
        });

        const promises = [loader.load(firstExpense.id), loader.load(secondExpense.id)];
        const [result1, result2] = await Promise.all(promises);
        expect(result1).to.be.true;
        expect(result2).to.be.false;
      });
    });
  });

  describe('requiredLegalDocuments', () => {
    const req = {};
    let host, collective, expenseWithUserTaxForm, expenseWithOutUserTaxForm, expenseWithTaxFormFromLastYear;

    before(async () => {
      host = await fakeHostWithRequiredLegalDocument();
      collective = await fakeCollective({ HostCollectiveId: host.id });
      const fromCollective = (await fakeUser()).collective;
      const fromCollective2 = (await fakeUser()).collective;

      expenseWithUserTaxForm = await fakeExpense({
        amount: US_TAX_FORM_THRESHOLD + 100e2,
        FromCollectiveId: fromCollective.id,
        CollectiveId: collective.id,
        type: 'INVOICE',
        status: 'APPROVED',
      });

      expenseWithOutUserTaxForm = await fakeExpense({
        type: 'INVOICE',
        FromCollectiveId: fromCollective2.id,
        CollectiveId: collective.id,
        amount: US_TAX_FORM_THRESHOLD - 100e2,
        status: 'APPROVED',
      });

      expenseWithTaxFormFromLastYear = await fakeExpense({
        amount: US_TAX_FORM_THRESHOLD + 100e2,
        FromCollectiveId: fromCollective2.id,
        CollectiveId: collective.id,
        type: 'INVOICE',
        incurredAt: new moment().subtract(1, 'year').toDate(),
        status: 'APPROVED',
      });

      // A fake expense to try to fool the previous results
      await fakeExpense({
        type: 'INVOICE',
        FromCollectiveId: fromCollective2.id,
        CollectiveId: (await fakeCollective()).id, // Host without tax form
        amount: US_TAX_FORM_THRESHOLD + 100e2,
        status: 'APPROVED',
      });
    });

    it('returns required legal documents', async () => {
      const loader = requiredLegalDocuments({ loaders: loaders(req) });
      let result = await loader.load(expenseWithUserTaxForm.id);
      expect(result).to.deep.eq([LEGAL_DOCUMENT_TYPE.US_TAX_FORM]);

      result = await loader.load(expenseWithTaxFormFromLastYear.id);
      expect(result).to.deep.eq([LEGAL_DOCUMENT_TYPE.US_TAX_FORM]);
    });

    it('returns no required legal document', async () => {
      const loader = requiredLegalDocuments({ loaders: loaders(req) });
      const result = await loader.load(expenseWithOutUserTaxForm.id);
      expect(result).to.deep.eq([]);
    });

    it('is not fooled by other expenses in the loader', async () => {
      const loader = requiredLegalDocuments({ loaders: loaders(req) });
      const result = await loader.loadMany([
        expenseWithUserTaxForm.id,
        expenseWithTaxFormFromLastYear.id,
        expenseWithOutUserTaxForm.id,
      ]);

      expect(result).to.deep.eq([[LEGAL_DOCUMENT_TYPE.US_TAX_FORM], [LEGAL_DOCUMENT_TYPE.US_TAX_FORM], []]);
    });
  });
});
