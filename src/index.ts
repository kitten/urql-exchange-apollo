import { ApolloLink, execute, FetchResult, GraphQLRequest } from 'apollo-link';
import { CombinedError, IExchange } from 'urql';
import { Observable } from 'zen-observable-ts';

export const apolloLinkExchange = (
  link: ApolloLink
): IExchange => operation => {
  const context = operation.context || {};

  const apolloOperation: GraphQLRequest = {
    context: {
      ...context,
      fetchOptions: context.fetchOptions || undefined,
      uri: context.url || undefined,
    },
    extensions: {},
    operationName: operation.operationName,
    query: operation.query as any,
    variables: operation.variables,
  };

  return new Observable(observer => {
    let complete = false;

    const sub = execute(link, apolloOperation).subscribe({
      complete: () => {
        if (!complete) {
          observer.complete();
          complete = true;
        }
      },
      error: e => {
        if (Array.isArray(e.graphQLErrors) || e.networkError) {
          observer.error(e);
        } else {
          observer.error(new CombinedError({ networkError: e }));
        }

        complete = true;
      },
      next: (result: FetchResult) => {
        const { errors, data } = result;

        const error = Array.isArray(errors)
          ? new CombinedError({ graphQLErrors: errors })
          : undefined;

        complete = true;

        if (data) {
          observer.next({ data, error });
          observer.complete();
        } else if (error !== undefined) {
          observer.error(error);
        } else {
          observer.error(new Error('no data or error'));
        }
      },
    });

    return () => sub.unsubscribe();
  });
};
