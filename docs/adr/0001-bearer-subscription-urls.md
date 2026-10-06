# Private subscription URLs grant read access

Output calendars are shared with people who only need to receive their events, without creating service accounts. Each output therefore has an unguessable subscription URL whose possession grants read access, and which remains stable until its owner deliberately rotates it. This supports simple calendar subscriptions but means forwarded URLs grant access too; rotation revokes the old URL for all subscribers, who must add the replacement.
