import { Meta, StoryObj } from '@storybook/react';
import React from 'react';

const meta: Meta = {
  title: 'Guides/Speaker Onboarding',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Complete step-by-step guide for speakers to manage meetings and schedules.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Step 1: Sign In
export const Step1SignIn: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Step 1: Sign In to Your Speaker Account</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        Access your speaker dashboard:
      </p>
      <ol style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>Open the HashPass app</li>
        <li style={{ marginBottom: '12px' }}>Enter your registered email address</li>
        <li style={{ marginBottom: '12px' }}>Check your email for the one-time login code</li>
        <li style={{ marginBottom: '12px' }}>Enter the code to access your speaker account</li>
      </ol>
    </div>
  ),
};

// Step 2: View Meeting Requests
export const Step2ViewRequests: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Step 2: View Meeting Requests</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        You'll receive notifications when attendees request meetings with you:
      </p>
      <ul style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>Check the Notifications icon in the app header</li>
        <li style={{ marginBottom: '12px' }}>View pending meeting requests from attendees</li>
        <li style={{ marginBottom: '12px' }}>See request details: attendee name, preferred time, and message</li>
        <li style={{ marginBottom: '12px' }}>Review all requests in your notifications panel</li>
      </ul>
    </div>
  ),
};

// Step 3: Accept Meeting Requests
export const Step3AcceptRequests: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Step 3: Accept Meeting Requests</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        When you're ready to accept a meeting request:
      </p>
      <ol style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>Open the meeting request notification</li>
        <li style={{ marginBottom: '12px' }}>Review the attendee's message and preferred time</li>
        <li style={{ marginBottom: '12px' }}>Click "Accept Request"</li>
        <li style={{ marginBottom: '12px' }}>Select an available time slot from your schedule</li>
        <li style={{ marginBottom: '12px' }}>Confirm the meeting details (date, time, location)</li>
        <li style={{ marginBottom: '12px' }}>The attendee will be notified of your acceptance</li>
      </ol>
    </div>
  ),
};

// Step 4: Manage Schedule
export const Step4ManageSchedule: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Step 4: Craft and Manage Your Schedule</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        Manage your availability and meetings:
      </p>
      <ul style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>View your Schedule to see all confirmed meetings</li>
        <li style={{ marginBottom: '12px' }}>Set your available time slots for meetings</li>
        <li style={{ marginBottom: '12px' }}>Update meeting details if needed</li>
        <li style={{ marginBottom: '12px' }}>Cancel meetings if your schedule changes (with advance notice)</li>
        <li style={{ marginBottom: '12px' }}>See upcoming meetings in chronological order</li>
      </ul>
    </div>
  ),
};

// Step 5: Decline Requests
export const Step5DeclineRequests: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px' }}>Step 5: Decline Requests (If Needed)</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        If you're unable to accept a meeting request:
      </p>
      <ol style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>Open the meeting request</li>
        <li style={{ marginBottom: '12px' }}>Click "Decline"</li>
        <li style={{ marginBottom: '12px' }}>Optionally add a message explaining why</li>
        <li style={{ marginBottom: '12px' }}>The attendee will be notified respectfully</li>
      </ol>
      <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#FFF3E0', borderRadius: '10px', border: '1px solid #FF9500' }}>
        <strong>💡 Tip:</strong> It's always appreciated to provide a brief reason when declining, though it's optional.
      </div>
    </div>
  ),
};

// Troubleshooting
export const Troubleshooting: Story = {
  render: () => (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '20px', color: '#FF9500' }}>🔧 Having Issues Loading the Web App?</h1>
      <p style={{ fontSize: '18px', lineHeight: '1.6', marginBottom: '30px', color: '#6d6d70' }}>
        If you're experiencing problems loading the web app, we recommend clearing your browser cache or performing a hard refresh:
      </p>
      <ul style={{ fontSize: '16px', lineHeight: '1.8', paddingLeft: '20px' }}>
        <li style={{ marginBottom: '12px' }}>
          <strong>Clear browser cache:</strong> Go to your browser settings and clear cached images and files
        </li>
        <li style={{ marginBottom: '12px' }}>
          <strong>Hard refresh:</strong> Press <code style={{ backgroundColor: '#f2f2f7', padding: '2px 6px', borderRadius: '4px' }}>Ctrl+Shift+R</code> (Windows/Linux) or <code style={{ backgroundColor: '#f2f2f7', padding: '2px 6px', borderRadius: '4px' }}>Cmd+Shift+R</code> (Mac) to reload the page without cache
        </li>
      </ul>
    </div>
  ),
};

