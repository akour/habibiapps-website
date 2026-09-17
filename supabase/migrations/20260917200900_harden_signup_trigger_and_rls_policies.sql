revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter policy "Users read own profile"
  on public.profiles
  using ((select auth.uid()) = user_id);

alter policy "Users update own profile"
  on public.profiles
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users read own subscription"
  on public.subscriptions
  using ((select auth.uid()) = user_id);

alter policy "Users read own deliveries"
  on public.job_deliveries
  using ((select auth.uid()) = user_id);

alter policy "Users manage own feedback"
  on public.job_feedback
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
