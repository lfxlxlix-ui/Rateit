CREATE TABLE IF NOT EXISTS party_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  responded_at TIMESTAMPTZ,
  CHECK (invited_by <> invitee_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_party_invites_pending_unique
ON party_invites(party_id, invitee_user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_party_invites_inbox
ON party_invites(invitee_user_id, created_at DESC) WHERE status='pending';
