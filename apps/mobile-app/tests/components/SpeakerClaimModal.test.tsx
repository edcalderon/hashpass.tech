import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('@hashpass/ui/primitives', () => ({
  ActionButton: 'ActionButton',
  FormField: 'FormField',
}));

import SpeakerClaimModal from '../../components/SpeakerClaimModal';

const longNote = 'I am the speaker listed on the agenda.';
let view: ReactTestRenderer;
const onSubmit = jest.fn();
const onClose = jest.fn();

const render = () => {
  act(() => {
    view = create(
      <SpeakerClaimModal
        visible
        speakerName="Ada Lovelace"
        currentEmail="ada@example.test"
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );
  });
};
const byId = (id: string) => view.root.findByProps({ testID: id });
const press = (id: string) => act(() => { byId(id).props.onPress(); });
const type = (id: string, value: string) => act(() => { byId(id).props.onChangeText(value); });
const submit = async () => { await act(async () => { await byId('claim-submit').props.onPress(); }); };

beforeEach(() => {
  onSubmit.mockReset().mockResolvedValue(undefined);
  onClose.mockReset();
});
afterEach(() => act(() => view?.unmount()));

it('asks which email to use before collecting anything', () => {
  render();
  expect(byId('claim-option-current_email')).toBeTruthy();
  expect(byId('claim-option-other_email')).toBeTruthy();
  expect(view.root.findAllByProps({ testID: 'claim-note' })).toHaveLength(0);
});

it('submits the signed-in email only once the note is explanatory enough', async () => {
  render();
  press('claim-option-current_email');
  type('claim-note', 'too short');
  expect(byId('claim-submit').props.disabled).toBe(true);

  type('claim-note', `  ${longNote}  `);
  expect(byId('claim-submit').props.disabled).toBe(false);
  await submit();

  expect(onSubmit).toHaveBeenCalledWith({ mode: 'current_email', email: '', note: longNote });
  expect(view.root.findAllByProps({ testID: 'claim-submit' })).toHaveLength(0);
});

it('requires a valid other email and normalizes it', async () => {
  render();
  press('claim-option-other_email');
  type('claim-note', longNote);
  type('claim-email', 'not-an-email');
  expect(byId('claim-submit').props.disabled).toBe(true);
  expect(byId('claim-email').props.error).toBe('speakerView.claimFlow.emailInvalid');

  type('claim-email', ' Ada@Work.test ');
  await submit();
  expect(onSubmit).toHaveBeenCalledWith({ mode: 'other_email', email: 'ada@work.test', note: longNote });
});

it('keeps the form open and shows the error when the claim is rejected', async () => {
  onSubmit.mockRejectedValue(new Error('A claim already exists'));
  render();
  press('claim-option-current_email');
  type('claim-note', longNote);
  await submit();

  expect(view.root.findByProps({ accessibilityRole: 'alert' }).props.children).toBe('A claim already exists');
  expect(byId('claim-submit').props.disabled).toBe(false);
});

it('goes back to the choice and closes from the overlay', () => {
  render();
  press('claim-option-other_email');
  act(() => {
    view.root.findByProps({ label: 'speakerView.claimFlow.back' }).props.onPress();
  });
  expect(byId('claim-option-current_email')).toBeTruthy();

  act(() => {
    view.root.findAllByProps({ accessibilityLabel: 'speakerView.claimFlow.close' })[0].props.onPress();
  });
  expect(onClose).toHaveBeenCalled();
});
