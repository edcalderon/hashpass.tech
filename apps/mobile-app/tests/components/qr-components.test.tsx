/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';

import ScanResultCard from '../../components/qr/ScanResultCard';
import ExternalClaimReview from '../../components/qr/ExternalClaimReview';
import ExternalTicketSheet from '../../components/qr/ExternalTicketSheet';

const mockSubmit = jest.fn();
const mockReport = jest.fn();

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialIcons: 'MaterialIcons' }));
jest.mock('../../lib/external-ticket-claims', () => ({
  submitExternalTicketClaim: (...args: unknown[]) => mockSubmit(...args),
  reportExternalTicket: (...args: unknown[]) => mockReport(...args),
}));

const textOf = (renderer: ReturnType<typeof create>) =>
  renderer.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => [node.props.children].flat().join(''));

const press = async (renderer: ReturnType<typeof create>, label: string) => {
  const target = renderer.root.findAllByProps({ accessibilityLabel: label }).find((n) => typeof n.props.onPress === 'function');
  expect(target).toBeTruthy();
  await act(async () => {
    await target!.props.onPress();
  });
};

const resolution = {
  valid: true,
  kind: 'pass_id' as const,
  message: 'Pass verified',
  user: { id: 'u1', name: 'Ada Lovelace', username: 'ada', email: 'ada@example.com' },
  pass: {
    id: 'p1', number: 'HP-001', type: 'vip', status: 'active', eventId: 'colombia2026',
    createdAt: null, updatedAt: null,
    requests: { used: 1, max: 5 }, boost: { used: 0, max: 2 },
  },
};

describe('ScanResultCard', () => {
  const render = (props: Partial<React.ComponentProps<typeof ScanResultCard>> = {}) => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<ScanResultCard resolution={resolution} mode="light" {...props} />);
    });
    return renderer;
  };

  it('shows the holder name, username, email and pass details', () => {
    const text = textOf(render());
    expect(text).toEqual(expect.arrayContaining(['Valid pass', 'Ada Lovelace', '@ada', 'ada@example.com', 'HP-001', 'colombia2026']));
  });

  it('hides usage unless staff ask for it', () => {
    expect(textOf(render())).not.toContain('Meeting requests');
    expect(textOf(render({ showUsage: true }))).toEqual(expect.arrayContaining(['Meeting requests', '1 / 5', 'Boost', '0 / 2']));
  });

  it('omits the email when the server did not send one and flags unusable passes', () => {
    const text = textOf(render({
      mode: 'dark',
      resolution: {
        ...resolution,
        valid: false,
        user: { id: 'u1', name: null, username: 'ada' },
        pass: { ...resolution.pass, status: 'suspended' },
      },
    }));
    expect(text).toEqual(expect.arrayContaining(['Pass unavailable', '@ada', 'SUSPENDED']));
    expect(text.some((value) => value.includes('@example.com'))).toBe(false);
  });

  it('renders wallet and network resolutions without a pass', () => {
    const text = textOf(render({
      resolution: { valid: true, kind: 'wallet', message: 'Wallet', network: 'ethereum', address: '0xabc' },
    }));
    expect(text).toEqual(expect.arrayContaining(['Wallet', 'ethereum', '0xabc']));
  });
});

describe('ExternalClaimReview', () => {
  const claim = {
    id: 'c1', event_id: 'chile2026', issuer: 'blockchain_summit_latam', ticket_code_last4: '9XQ2',
    requested_pass_type: 'business', status: 'pending', hashpass_pass_id: null,
    claimant_email: 'claimant@example.com',
  };
  const render = (inspection: any, onApprove = jest.fn()) => {
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<ExternalClaimReview inspection={inspection} mode="light" onApprove={onApprove} />);
    });
    return { renderer, onApprove };
  };

  it('shows who claimed the ticket and offers approval while reviewable', async () => {
    const { renderer, onApprove } = render({ valid: true, status: 'pending', message: 'Ready', claim });
    expect(textOf(renderer)).toEqual(expect.arrayContaining(['claimant@example.com', '••••9XQ2', 'BUSINESS', 'PENDING']));
    await press(renderer, 'Approve & create pass');
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('offers no approval once converted and lists the linked pass', () => {
    const { renderer } = render({
      valid: false, status: 'converted', message: 'Done',
      claim: { ...claim, status: 'converted', hashpass_pass_id: 'pass-9', claimant_email: null },
    });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Approve & create pass' })).toHaveLength(0);
    expect(textOf(renderer)).toEqual(expect.arrayContaining(['pass-9']));
    expect(textOf(renderer)).not.toContain('Claimed by');
  });

  it('explains an unregistered ticket', () => {
    const { renderer } = render({ valid: false, status: 'unregistered', message: '' });
    expect(textOf(renderer)).toContain('No matching claim is registered for this QR yet.');
  });
});

describe('ExternalTicketSheet', () => {
  const ticket = {
    raw: 'https://tickets.blckchn.xyz/t/ABCD1234',
    ticketCode: 'ABCD1234',
    issuer: 'blockchain_summit_latam',
    issuerLabel: 'Blockchain Summit LATAM',
    eventId: 'colombia2026',
    metadata: { holder: 'Grace Hopper', ticketType: 'VIP' },
  };
  const render = (override: Record<string, unknown> = {}) => {
    const onDone = jest.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<ExternalTicketSheet ticket={{ ...ticket, ...override } as any} mode="light" onDone={onDone} />);
    });
    return { renderer, onDone };
  };

  beforeEach(() => {
    mockSubmit.mockReset();
    mockReport.mockReset();
  });

  it('shows ticket facts with only the last four characters of the code', () => {
    const text = textOf(render().renderer);
    expect(text).toEqual(expect.arrayContaining(['Blockchain Summit LATAM', '••••1234', 'Grace Hopper', 'VIP']));
    expect(text).not.toContain('ABCD1234');
  });

  it('requires an event before creating a pass', async () => {
    const { renderer } = render({ eventId: undefined });
    await press(renderer, 'Create my HashPass pass');
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(textOf(renderer)).toContain('Choose the event this ticket is for.');
  });

  it('submits the claim and confirms it', async () => {
    mockSubmit.mockResolvedValue({ status: 'pending' });
    const { renderer, onDone } = render();
    await press(renderer, 'Create my HashPass pass');
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'colombia2026', issuer: 'blockchain_summit_latam', ticketCode: 'ABCD1234', requestedPassType: 'general',
    }));
    expect(textOf(renderer)).toContain('Ticket sent for verification');
    await press(renderer, 'Scan another code');
    expect(onDone).toHaveBeenCalled();
  });

  it('reports a converted claim as ready', async () => {
    mockSubmit.mockResolvedValue({ status: 'converted' });
    const { renderer } = render();
    await press(renderer, 'Create my HashPass pass');
    expect(textOf(renderer)).toContain('Your HashPass pass is ready');
  });

  it('surfaces other failures and lets the user retry', async () => {
    mockSubmit.mockRejectedValue(new Error('boom'));
    const { renderer } = render();
    await press(renderer, 'Create my HashPass pass');
    expect(textOf(renderer)).toContain('boom');
  });

  it('lets a second claimant report the ticket after a 409', async () => {
    mockSubmit.mockRejectedValue(Object.assign(new Error('claimed'), { status: 409 }));
    mockReport.mockResolvedValue(undefined);
    const { renderer } = render();
    await press(renderer, 'Create my HashPass pass');
    expect(textOf(renderer)).toContain('Ticket already claimed');

    const input = renderer.root.findByProps({ accessibilityLabel: 'Report details' });
    act(() => input.props.onChangeText('  bought from Ana  '));
    await press(renderer, 'Report ticket misuse');
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'colombia2026', reason: 'impersonation', details: 'bought from Ana',
    }));
    expect(textOf(renderer)).toContain('Report received');
  });

  it('shows a report failure without leaving the form', async () => {
    mockSubmit.mockRejectedValue(Object.assign(new Error('claimed'), { status: 409 }));
    mockReport.mockRejectedValue(new Error('offline'));
    const { renderer } = render();
    await press(renderer, 'Create my HashPass pass');
    await press(renderer, 'Report ticket misuse');
    expect(textOf(renderer)).toContain('offline');
    expect(mockReport).toHaveBeenCalledWith(expect.objectContaining({ details: undefined }));
  });
});
