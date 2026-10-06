# Transactional membership admission

Persist admitted membership separately from Better Auth identities/sessions and check it on every private operation, because Google authentication can succeed before invitation admission is committed. Lock the identity and atomically claim the invitation and create membership in one PostgreSQL transaction, preventing concurrent redemption and repeated admission spending two links. Failed admission may leave an authenticated identity without calendar access, which can retry with a usable invitation.
